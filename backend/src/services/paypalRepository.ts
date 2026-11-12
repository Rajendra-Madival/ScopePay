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
  getMilestone(id: string): Promise<{
    id: string
    amount: number
    status: 'PENDING' | 'PAID'
    currency: string
  } | null>
  reservePayment(milestoneId: string, amount: number, currency: string): Promise<
    | { kind: 'created'; paymentId: string }
    | { kind: 'existing'; orderId: string }
    | { kind: 'busy' }
    | { kind: 'missing' }
    | { kind: 'changed' }
  >
  saveOrder(paymentId: string, orderId: string): Promise<void>
  deleteReservation(paymentId: string): Promise<void>
  getPaymentForCapture(orderId: string): Promise<PaymentForCapture | null>
  claimPayment(paymentId: string): Promise<boolean>
  releasePayment(paymentId: string, failed?: boolean): Promise<void>
  cancelPayment(orderId: string): Promise<boolean>
  completePayment(paymentId: string, milestoneId: string): Promise<void>
}

export function createPaypalRepository(database: Database = prisma): PaypalRepository {
  return {
    async getMilestone(id) {
      return database.milestone.findUnique({
        where: { id },
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

    async reservePayment(milestoneId, amount, currency) {
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
          WHERE m."id" = ${milestoneId}
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

    async saveOrder(paymentId, orderId) {
      await database.payment.update({
        where: { id: paymentId, status: 'CREATING' },
        data: { paypalOrderId: orderId, status: 'PENDING' },
      })
    },

    async deleteReservation(paymentId) {
      await database.payment.deleteMany({
        where: { id: paymentId, status: 'CREATING' },
      })
    },

    async getPaymentForCapture(orderId) {
      return database.payment.findUnique({
        where: { paypalOrderId: orderId },
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

    async claimPayment(paymentId) {
      const result = await database.payment.updateMany({
        where: { id: paymentId, status: 'PENDING' },
        data: { status: 'PROCESSING' },
      })
      return result.count === 1
    },

    async releasePayment(paymentId, failed = false) {
      await database.payment.updateMany({
        where: { id: paymentId, status: 'PROCESSING' },
        data: { status: failed ? 'FAILED' : 'PENDING' },
      })
    },

    async cancelPayment(orderId) {
      const result = await database.payment.updateMany({
        where: { paypalOrderId: orderId, status: 'PENDING' },
        data: { status: 'CANCELLED' },
      })
      return result.count === 1
    },

    async completePayment(paymentId, milestoneId) {
      await database.$transaction(async (transaction) => {
        const payment = await transaction.payment.updateMany({
          where: { id: paymentId, status: 'PROCESSING' },
          data: { status: 'COMPLETED' },
        })
        if (payment.count !== 1) throw new Error('Payment could not be finalized')

        const milestone = await transaction.milestone.updateMany({
          where: { id: milestoneId, status: 'PENDING' },
          data: { status: 'PAID' },
        })
        if (milestone.count !== 1) throw new Error('Milestone could not be finalized')
      })
    },
  }
}
