import { Router } from 'express'
import type { Database } from '../config/database.js'
import { getAuthenticatedUser } from '../middleware/auth.js'
import { HttpError } from '../middleware/errors.js'
import { idParamsSchema, updateMilestoneSchema } from '../validation/schemas.js'

export function createMilestonesRouter(prisma: Database) {
  const milestonesRouter = Router()

milestonesRouter.get('/', async (request, response) => {
  const ownerId = getAuthenticatedUser(request).id
  const milestones = await prisma.milestone.findMany({
    where: { project: { ownerId } },
    include: { project: { select: { id: true, title: true, clientName: true } } },
    orderBy: { createdAt: 'desc' },
  })
  response.json(milestones)
})

milestonesRouter.get('/:id', async (request, response) => {
  const ownerId = getAuthenticatedUser(request).id
  const { id } = idParamsSchema.parse(request.params)
  const milestone = await prisma.milestone.findFirst({
    where: { id, project: { ownerId } },
    include: { payments: true },
  })
  if (!milestone) throw new HttpError(404, 'Milestone not found')
  response.json(milestone)
})

milestonesRouter.patch('/:id', async (request, response) => {
  const ownerId = getAuthenticatedUser(request).id
  const { id } = idParamsSchema.parse(request.params)
  const input = updateMilestoneSchema.parse(request.body)
  if (Object.keys(input).length === 0) {
    response.status(400).json({ error: 'Request validation failed', issues: [{ path: '', message: 'At least one field is required' }] })
    return
  }
  const milestone = await prisma.$transaction(async (transaction) => {
    const [existing] = await transaction.$queryRaw<{ id: string; status: 'PENDING' | 'PAID' }[]>`
      SELECT m."id", m."status"
      FROM "Milestone" AS m
      INNER JOIN "Project" AS p ON p."id" = m."projectId"
      WHERE m."id" = ${id} AND p."ownerId" = ${ownerId}
      FOR UPDATE OF m
    `
    if (!existing) throw new HttpError(404, 'Milestone not found')
    const activePayment = await transaction.payment.findFirst({
      where: { milestoneId: id, status: { in: ['CREATING', 'PENDING', 'PROCESSING', 'COMPLETED'] } },
      select: { id: true },
    })
    if (existing.status === 'PAID' || activePayment) {
      throw new HttpError(409, 'Milestones with a paid or active payment cannot be changed')
    }
    const updated = await transaction.milestone.updateMany({
      where: { id, project: { ownerId } },
      data: {
        ...input,
        ...(input.dueDate !== undefined
          ? { dueDate: input.dueDate ? new Date(`${input.dueDate}T00:00:00.000Z`) : null }
          : {}),
      },
    })
    if (updated.count !== 1) throw new HttpError(404, 'Milestone not found')
    return transaction.milestone.findFirst({ where: { id, project: { ownerId } } })
  })
  response.json(milestone)
})

milestonesRouter.delete('/:id', async (request, response) => {
  const ownerId = getAuthenticatedUser(request).id
  const { id } = idParamsSchema.parse(request.params)
  await prisma.$transaction(async (transaction) => {
    const [existing] = await transaction.$queryRaw<{ id: string; status: 'PENDING' | 'PAID' }[]>`
      SELECT m."id", m."status"
      FROM "Milestone" AS m
      INNER JOIN "Project" AS p ON p."id" = m."projectId"
      WHERE m."id" = ${id} AND p."ownerId" = ${ownerId}
      FOR UPDATE OF m
    `
    if (!existing) throw new HttpError(404, 'Milestone not found')
    const payment = await transaction.payment.findFirst({
      where: { milestoneId: id },
      select: { id: true },
    })
    if (existing.status === 'PAID' || payment) {
      throw new HttpError(409, 'Milestones with payment records cannot be deleted')
    }
    await transaction.milestone.deleteMany({ where: { id, project: { ownerId } } })
  })
  response.status(204).end()
})

  return milestonesRouter
}
