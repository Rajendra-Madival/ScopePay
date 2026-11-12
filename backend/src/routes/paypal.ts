import { Router } from 'express'
import { z } from 'zod'
import { env } from '../config/env.js'
import { getAuthenticatedUser } from '../middleware/auth.js'
import { HttpError } from '../middleware/errors.js'
import { PaypalApiError, type PaypalGateway } from '../services/paypalClient.js'
import type { PaypalRepository } from '../services/paypalRepository.js'

const createOrderSchema = z.object({
  milestoneId: z.string().min(1).max(64),
}).strict()

const captureOrderSchema = z.object({
  orderId: z.string().min(1).max(128),
}).strict()

function isVerifiedCapture(
  order: Awaited<ReturnType<PaypalGateway['captureOrder']>>,
  expected: {
    orderId: string
    paymentId: string
    milestoneId: string
    amount: number
    currency: string
  },
) {
  if (order.id !== expected.orderId || order.status !== 'COMPLETED') return false
  const purchaseUnits = order.purchase_units ?? []
  if (purchaseUnits.length !== 1) return false

  const unit = purchaseUnits[0]
  if (
    unit?.reference_id !== expected.milestoneId ||
    unit.custom_id !== expected.paymentId ||
    unit.amount?.currency_code !== expected.currency ||
    unit.amount.value !== (expected.amount / 100).toFixed(2)
  ) return false

  const captures = unit.payments?.captures ?? []
  return captures.length === 1 &&
    captures[0]?.status === 'COMPLETED' &&
    Boolean(captures[0].id) &&
    captures[0].amount?.currency_code === expected.currency &&
    captures[0].amount.value === (expected.amount / 100).toFixed(2)
}

export function createPaypalRouter(
  repository: PaypalRepository,
  paypal: PaypalGateway,
) {
  const router = Router()

  router.post('/create-order', async (request, response) => {
    const ownerId = getAuthenticatedUser(request).id
    const { milestoneId } = createOrderSchema.parse(request.body)
    const milestone = await repository.getMilestone(milestoneId, ownerId)
    if (!milestone) throw new HttpError(404, 'Milestone not found')
    if (milestone.status !== 'PENDING') {
      throw new HttpError(409, 'Only unpaid milestones can be checked out')
    }
    if (milestone.currency !== env.PAYPAL_CURRENCY) {
      throw new HttpError(409, `PayPal checkout is only configured for ${env.PAYPAL_CURRENCY} projects`)
    }
    if (!Number.isSafeInteger(milestone.amount) || milestone.amount <= 0) {
      throw new HttpError(409, 'Milestone amount is not eligible for checkout')
    }

    const reservation = await repository.reservePayment(
      milestoneId,
      ownerId,
      milestone.amount,
      env.PAYPAL_CURRENCY,
    )
    if (reservation.kind === 'existing') {
      response.json({ orderId: reservation.orderId })
      return
    }
    if (reservation.kind === 'missing') throw new HttpError(404, 'Milestone not found')
    if (reservation.kind === 'changed') {
      throw new HttpError(409, 'Milestone details changed. Refresh and try again.')
    }
    if (reservation.kind === 'busy') {
      throw new HttpError(409, 'A checkout for this milestone is already in progress')
    }

    try {
      const orderId = await paypal.createOrder({
        milestoneId,
        paymentId: reservation.paymentId,
        amount: milestone.amount,
        currency: env.PAYPAL_CURRENCY,
      })
      await repository.saveOrder(reservation.paymentId, orderId, ownerId)
      response.status(201).json({ orderId })
    } catch (error) {
      await repository.deleteReservation(reservation.paymentId, ownerId)
      throw error
    }
  })

  router.post('/cancel-order', async (request, response) => {
    const ownerId = getAuthenticatedUser(request).id
    const { orderId } = captureOrderSchema.parse(request.body)
    if (!(await repository.cancelPayment(orderId, ownerId))) {
      throw new HttpError(409, 'This PayPal order cannot be cancelled')
    }
    response.status(204).end()
  })

  router.post('/capture-order', async (request, response) => {
    const ownerId = getAuthenticatedUser(request).id
    const { orderId } = captureOrderSchema.parse(request.body)
    const payment = await repository.getPaymentForCapture(orderId, ownerId)
    if (!payment) throw new HttpError(404, 'PayPal order is not associated with a payment')
    if (payment.status === 'COMPLETED') {
      throw new HttpError(409, 'This PayPal order has already been captured')
    }
    if (payment.status !== 'PENDING') {
      throw new HttpError(409, 'This PayPal order is not ready to capture')
    }
    if (
      payment.milestoneId !== payment.milestone.id ||
      payment.amount !== payment.milestone.amount ||
      payment.currency !== env.PAYPAL_CURRENCY ||
      payment.milestone.project.currency !== payment.currency ||
      payment.milestone.status !== 'PENDING'
    ) {
      throw new HttpError(409, 'Payment does not match the current milestone')
    }
    if (!(await repository.claimPayment(payment.id, ownerId))) {
      throw new HttpError(409, 'This PayPal order is already being captured')
    }

    let verified = false
    let receivedResponse = false
    try {
      const order = await paypal.captureOrder(orderId)
      receivedResponse = true
      verified = isVerifiedCapture(order, {
        orderId,
        paymentId: payment.id,
        milestoneId: payment.milestoneId,
        amount: payment.amount,
        currency: payment.currency,
      })
      if (!verified) throw new HttpError(502, 'PayPal capture could not be verified')
      await repository.completePayment(payment.id, payment.milestoneId, ownerId)
    } catch (error) {
      if (!verified) {
        await repository.releasePayment(
          payment.id,
          ownerId,
          receivedResponse || (error instanceof PaypalApiError && error.paymentFailed),
        )
      }
      throw error
    }

    response.json({ status: 'COMPLETED', milestoneId: payment.milestoneId })
  })

  return router
}
