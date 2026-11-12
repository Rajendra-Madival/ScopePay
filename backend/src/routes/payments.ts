import { Router } from 'express'
import type { Database } from '../config/database.js'
import { HttpError } from '../middleware/errors.js'
import { idParamsSchema, paymentQuerySchema } from '../validation/schemas.js'

export function createPaymentsRouter(prisma: Database) {
  const paymentsRouter = Router()

paymentsRouter.get('/', async (request, response) => {
  const { milestoneId, projectId } = paymentQuerySchema.parse(request.query)
  const payments = await prisma.payment.findMany({
    where: {
      paypalOrderId: { not: null },
      status: { not: 'CREATING' },
      ...(milestoneId ? { milestoneId } : {}),
      ...(projectId ? { milestone: { projectId } } : {}),
    },
    include: {
      milestone: {
        include: { project: { select: { id: true, title: true, clientName: true } } },
      },
    },
    orderBy: { createdAt: 'desc' },
  })
  response.json(payments)
})

paymentsRouter.get('/:id', async (request, response) => {
  const { id } = idParamsSchema.parse(request.params)
  const payment = await prisma.payment.findUnique({
    where: { id },
    include: {
      milestone: {
        include: { project: { select: { id: true, title: true, clientName: true } } },
      },
    },
  })
  if (!payment) throw new HttpError(404, 'Payment not found')
  response.json(payment)
})

  return paymentsRouter
}
