import { Router } from 'express'
import type { Database } from '../config/database.js'
import { HttpError } from '../middleware/errors.js'
import {
  createMilestoneSchema,
  createProjectSchema,
  idParamsSchema,
  projectParamsSchema,
  updateProjectSchema,
} from '../validation/schemas.js'

export function createProjectsRouter(prisma: Database) {
  const projectsRouter = Router()

projectsRouter.get('/', async (_request, response) => {
  const projects = await prisma.project.findMany({
    include: { milestones: { orderBy: { createdAt: 'asc' } } },
    orderBy: { createdAt: 'desc' },
  })
  response.json(projects)
})

projectsRouter.post('/', async (request, response) => {
  const input = createProjectSchema.parse(request.body)
  const project = await prisma.project.create({ data: input })
  response.status(201).json({ ...project, milestones: [] })
})

projectsRouter.get('/:id', async (request, response) => {
  const { id } = idParamsSchema.parse(request.params)
  const project = await prisma.project.findUnique({
    where: { id },
    include: { milestones: { orderBy: { createdAt: 'asc' } } },
  })
  if (!project) throw new HttpError(404, 'Project not found')
  response.json(project)
})

projectsRouter.patch('/:id', async (request, response) => {
  const { id } = idParamsSchema.parse(request.params)
  const input = updateProjectSchema.parse(request.body)
  if (Object.keys(input).length === 0) throw new HttpError(400, 'At least one project field is required')
  const project = await prisma.$transaction(async (transaction) => {
    const [existing] = await transaction.$queryRaw<{ id: string; currency: string }[]>`
      SELECT "id", "currency" FROM "Project" WHERE "id" = ${id} FOR UPDATE
    `
    if (!existing) throw new HttpError(404, 'Project not found')
    if (input.currency && input.currency !== existing.currency) {
      const payment = await transaction.payment.findFirst({
        where: { milestone: { projectId: id } },
        select: { id: true },
      })
      if (payment) throw new HttpError(409, 'Project currency cannot change after a payment record exists')
    }
    return transaction.project.update({ where: { id }, data: input })
  })
  response.json(project)
})

projectsRouter.delete('/:id', async (request, response) => {
  const { id } = idParamsSchema.parse(request.params)
  const exists = await prisma.project.findUnique({ where: { id }, select: { id: true } })
  if (!exists) throw new HttpError(404, 'Project not found')
  await prisma.project.delete({ where: { id } })
  response.status(204).end()
})

projectsRouter.get('/:projectId/milestones', async (request, response) => {
  const { projectId } = projectParamsSchema.parse(request.params)
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } })
  if (!project) throw new HttpError(404, 'Project not found')
  const milestones = await prisma.milestone.findMany({
    where: { projectId },
    orderBy: { createdAt: 'asc' },
  })
  response.json(milestones)
})

projectsRouter.post('/:projectId/milestones', async (request, response) => {
  const { projectId } = projectParamsSchema.parse(request.params)
  const input = createMilestoneSchema.parse(request.body)
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } })
  if (!project) throw new HttpError(404, 'Project not found')
  const milestone = await prisma.milestone.create({
    data: {
      ...input,
      dueDate: input.dueDate ? new Date(`${input.dueDate}T00:00:00.000Z`) : null,
      projectId,
    },
  })
  response.status(201).json(milestone)
})

  return projectsRouter
}
