import { prisma, type Database } from '../config/database.js'

export type PaymentForCapture = {
  id: string
  milestoneId: string
  amount: number
  currency: string
  status: 'CREATING' | 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED'
  milestone: {
    id: string
    amount: number
    status: 'PENDING' | 'PAID'
    project: { currency: string }
  }
}

export type PaypalRepository = {
  getMilestone(id: string, ownerId: string): Promise<{
    id: string
    amount: number
    status: 'PENDING' | 'PAID'
    currency: string
  } | null>
  reservePayment(milestoneId: string, ownerId: string, amount: number, currency: string): Promise<
    | { kind: 'created'; paymentId: string }
    | { kind: 'existing'; orderId: string }
    | { kind: 'busy' }
    | { kind: 'missing' }
    | { kind: 'changed' }
  >
  saveOrder(paymentId: string, orderId: string, ownerId: string): Promise<void>
  deleteReservation(paymentId: string, ownerId: string): Promise<void>
  getPaymentForCapture(orderId: string, ownerId: string): Promise<PaymentForCapture | null>
  claimPayment(paymentId: string, ownerId: string): Promise<boolean>
  releasePayment(paymentId: string, ownerId: string, failed?: boolean): Promise<void>
  cancelPayment(orderId: string, ownerId: string): Promise<boolean>
  completePayment(paymentId: string, milestoneId: string, ownerId: string): Promise<void>
}

export function createPaypalRepository(database: Database = prisma): PaypalRepository {
  return {
    async getMilestone(id, ownerId) {
      return database.milestone.findFirst({
        where: { id, project: { ownerId } },
        select: { id: true, amount: true, status: true, project: { select: { currency: true } } },
      }).then((milestone) =>
        milestone
          ? {
              id: milestone.id,
              amount: milestone.amount,
              status: milestone.status,
              currency: milestone.project.currency,
            }
          : null,
      )
    },

    async reservePayment(milestoneId, ownerId, amount, currency) {
      return database.$transaction(async (transaction) => {
        const milestone = await transaction.$queryRaw<{
          id: string
          amount: number
          status: 'PENDING' | 'PAID'
          currency: string
        }[]>`
          SELECT m."id", m."amount", m."status", p."currency"
          FROM "Milestone" AS m
          INNER JOIN "Project" AS p ON p."id" = m."projectId"
          WHERE m."id" = ${milestoneId} AND p."ownerId" = ${ownerId}
          FOR UPDATE OF m, p
        `
        if (milestone.length === 0) return { kind: 'missing' as const }
        if (
          milestone[0]?.status !== 'PENDING' ||
          milestone[0]?.amount !== amount ||
          milestone[0]?.currency !== currency
        ) return { kind: 'changed' as const }

        const existing = await transaction.payment.findFirst({
          where: {
            milestoneId,
            milestone: { project: { ownerId } },
            status: { in: ['CREATING', 'PENDING', 'PROCESSING'] },
          },
          orderBy: { createdAt: 'desc' },
        })
        if (existing) {
          const staleBefore = new Date(Date.now() - 120_000)
          if (existing.status === 'CREATING' && existing.createdAt < staleBefore) {
            await transaction.payment.update({
              where: { id: existing.id },
              data: { status: 'FAILED' },
            })
          } else if (existing.status === 'PROCESSING' && existing.updatedAt < staleBefore) {
            await transaction.payment.update({
              where: { id: existing.id },
              data: { status: 'PENDING' },
            })
            if (existing.paypalOrderId) {
              return { kind: 'existing' as const, orderId: existing.paypalOrderId }
            }
          } else {
            return existing.status === 'PENDING' && existing.paypalOrderId
              ? { kind: 'existing' as const, orderId: existing.paypalOrderId }
              : { kind: 'busy' as const }
          }
        }

        const reservation = await transaction.payment.create({
          data: {
            milestoneId,
            amount,
            currency,
            status: 'CREATING',
          },
        })
        return { kind: 'created' as const, paymentId: reservation.id }
      })
    },

    async saveOrder(paymentId, orderId, ownerId) {
      const updated = await database.payment.updateMany({
        where: {
          id: paymentId,
          status: 'CREATING',
          milestone: { project: { ownerId } },
        },
        data: { paypalOrderId: orderId, status: 'PENDING' },
      })
      if (updated.count !== 1) throw new Error('Payment reservation could not be saved')
    },

    async deleteReservation(paymentId, ownerId) {
      await database.payment.deleteMany({
        where: {
          id: paymentId,
          status: 'CREATING',
          milestone: { project: { ownerId } },
        },
      })
    },

    async getPaymentForCapture(orderId, ownerId) {
      return database.payment.findFirst({
        where: { paypalOrderId: orderId, milestone: { project: { ownerId } } },
        include: {
          milestone: {
            select: {
              id: true,
              amount: true,
              status: true,
              project: { select: { currency: true } },
            },
          },
        },
      })
    },

    async claimPayment(paymentId, ownerId) {
      const result = await database.payment.updateMany({
        where: {
          id: paymentId,
          status: 'PENDING',
          milestone: { project: { ownerId } },
        },
        data: { status: 'PROCESSING' },
      })
      return result.count === 1
    },

    async releasePayment(paymentId, ownerId, failed = false) {
      await database.payment.updateMany({
        where: {
          id: paymentId,
          status: 'PROCESSING',
          milestone: { project: { ownerId } },
        },
        data: { status: failed ? 'FAILED' : 'PENDING' },
      })
    },

    async cancelPayment(orderId, ownerId) {
      const result = await database.payment.updateMany({
        where: {
          paypalOrderId: orderId,
          status: 'PENDING',
          milestone: { project: { ownerId } },
        },
        data: { status: 'CANCELLED' },
      })
      return result.count === 1
    },

    async completePayment(paymentId, milestoneId, ownerId) {
      await database.$transaction(async (transaction) => {
        const payment = await transaction.payment.updateMany({
          where: {
            id: paymentId,
            status: 'PROCESSING',
            milestone: { project: { ownerId } },
          },
          data: { status: 'COMPLETED' },
        })
        if (payment.count !== 1) throw new Error('Payment could not be finalized')

        const milestone = await transaction.milestone.updateMany({
          where: { id: milestoneId, status: 'PENDING', project: { ownerId } },
          data: { status: 'PAID' },
        })
        if (milestone.count !== 1) throw new Error('Milestone could not be finalized')
      })
    },
  }
}
