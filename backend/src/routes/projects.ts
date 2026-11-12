import { Router } from 'express'
import type { Database } from '../config/database.js'
import { getAuthenticatedUser } from '../middleware/auth.js'
import { HttpError } from '../middleware/errors.js'
import {
  analyzeScopeChangeSchema,
  createMilestoneSchema,
  createProjectSchema,
  createScopeChangeSchema,
  idParamsSchema,
  projectParamsSchema,
  updateProjectSchema,
} from '../validation/schemas.js'
import type { ScopeAnalysis, ScopeRequirements } from '../services/openAiScopeAnalyzer.js'
import { createOpenAiScopeAnalyzer } from '../services/openAiScopeAnalyzer.js'

export function createProjectsRouter(
  prisma: Database,
  analyzeScopeChange: (requirements: ScopeRequirements) => Promise<ScopeAnalysis> = createOpenAiScopeAnalyzer(),
) {
  const projectsRouter = Router()
  const analysisAttempts = new Map<string, { count: number; resetAt: number }>()

  const limitScopeAnalysis: import('express').RequestHandler = (request, response, next) => {
    const ownerId = getAuthenticatedUser(request).id
    const now = Date.now()
    let attempt = analysisAttempts.get(ownerId)
    if (!attempt || attempt.resetAt <= now) {
      attempt = { count: 0, resetAt: now + 60_000 }
      analysisAttempts.set(ownerId, attempt)
    }

    attempt.count += 1
    if (attempt.count > 10) {
      response.setHeader('Retry-After', String(Math.ceil((attempt.resetAt - now) / 1000)))
      response.status(429).json({ error: 'Too many AI analysis requests. Please try again later.' })
      return
    }

    if (analysisAttempts.size > 2000) {
      for (const [userId, value] of analysisAttempts) {
        if (value.resetAt <= now) analysisAttempts.delete(userId)
      }
    }
    next()
  }

projectsRouter.get('/', async (request, response) => {
  const ownerId = getAuthenticatedUser(request).id
  const projects = await prisma.project.findMany({
    where: { ownerId },
    include: {
      milestones: { orderBy: { createdAt: 'asc' } },
      scopeChanges: { orderBy: { createdAt: 'desc' } },
    },
    orderBy: { createdAt: 'desc' },
  })
  response.json(projects)
})

projectsRouter.post('/', async (request, response) => {
  const ownerId = getAuthenticatedUser(request).id
  const input = createProjectSchema.parse(request.body)
  const { deadline, plan, milestones, ...projectInput } = input
  const project = await prisma.$transaction(async (transaction) => {
    const savedProject = await transaction.project.create({
      data: {
        ...projectInput,
        ownerId,
        ...(deadline === undefined ? {} : { deadline }),
        ...(plan === undefined ? {} : { plan }),
      },
    })
    const savedMilestones = milestones
      ? await Promise.all(milestones.map((milestone) => transaction.milestone.create({
          data: {
            ...milestone,
            projectId: savedProject.id,
          },
        })))
      : []
    return { ...savedProject, milestones: savedMilestones, scopeChanges: [] }
  })
  response.status(201).json(project)
})

projectsRouter.get('/:id', async (request, response) => {
  const ownerId = getAuthenticatedUser(request).id
  const { id } = idParamsSchema.parse(request.params)
  const project = await prisma.project.findFirst({
    where: { id, ownerId },
    include: {
      milestones: { orderBy: { createdAt: 'asc' } },
      scopeChanges: { orderBy: { createdAt: 'desc' } },
    },
  })
  if (!project) throw new HttpError(404, 'Project not found')
  response.json(project)
})

projectsRouter.patch('/:id', async (request, response) => {
  const ownerId = getAuthenticatedUser(request).id
  const { id } = idParamsSchema.parse(request.params)
  const input = updateProjectSchema.parse(request.body)
  if (Object.keys(input).length === 0) throw new HttpError(400, 'At least one project field is required')
  const project = await prisma.$transaction(async (transaction) => {
    const [existing] = await transaction.$queryRaw<{ id: string; currency: string }[]>`
      SELECT "id", "currency" FROM "Project"
      WHERE "id" = ${id} AND "ownerId" = ${ownerId}
      FOR UPDATE
    `
    if (!existing) throw new HttpError(404, 'Project not found')
    if (input.currency && input.currency !== existing.currency) {
      const payment = await transaction.payment.findFirst({
        where: { milestone: { projectId: id } },
        select: { id: true },
      })
      if (payment) throw new HttpError(409, 'Project currency cannot change after a payment record exists')
    }
    const updated = await transaction.project.updateMany({
      where: { id, ownerId },
      data: input,
    })
    if (updated.count !== 1) throw new HttpError(404, 'Project not found')
    return transaction.project.findFirst({ where: { id, ownerId } })
  })
  response.json(project)
})

projectsRouter.delete('/:id', async (request, response) => {
  const ownerId = getAuthenticatedUser(request).id
  const { id } = idParamsSchema.parse(request.params)
  const exists = await prisma.project.findFirst({ where: { id, ownerId }, select: { id: true } })
  if (!exists) throw new HttpError(404, 'Project not found')
  await prisma.project.deleteMany({ where: { id, ownerId } })
  response.status(204).end()
})

projectsRouter.get('/:projectId/milestones', async (request, response) => {
  const ownerId = getAuthenticatedUser(request).id
  const { projectId } = projectParamsSchema.parse(request.params)
  const project = await prisma.project.findFirst({
    where: { id: projectId, ownerId },
    select: { id: true },
  })
  if (!project) throw new HttpError(404, 'Project not found')
  const milestones = await prisma.milestone.findMany({
    where: { projectId },
    orderBy: { createdAt: 'asc' },
  })
  response.json(milestones)
})

projectsRouter.post('/:projectId/milestones', async (request, response) => {
  const ownerId = getAuthenticatedUser(request).id
  const { projectId } = projectParamsSchema.parse(request.params)
  const input = createMilestoneSchema.parse(request.body)
  const project = await prisma.project.findFirst({
    where: { id: projectId, ownerId },
    select: { id: true },
  })
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

projectsRouter.get('/:projectId/scope-changes', async (request, response) => {
  const ownerId = getAuthenticatedUser(request).id
  const { projectId } = projectParamsSchema.parse(request.params)
  const project = await prisma.project.findFirst({
    where: { id: projectId, ownerId },
    select: { id: true },
  })
  if (!project) throw new HttpError(404, 'Project not found')

  const scopeChanges = await prisma.scopeChange.findMany({
    where: { projectId },
    orderBy: { createdAt: 'desc' },
  })

  response.json(scopeChanges)
})

projectsRouter.post('/:projectId/scope-changes/analyze', limitScopeAnalysis, async (request, response) => {
  const ownerId = getAuthenticatedUser(request).id
  const { projectId } = projectParamsSchema.parse(request.params)
  const requirements = analyzeScopeChangeSchema.parse(request.body)
  const project = await prisma.project.findFirst({
    where: { id: projectId, ownerId },
    select: { id: true },
  })
  if (!project) throw new HttpError(404, 'Project not found')

  response.json(await analyzeScopeChange(requirements))
})

projectsRouter.post('/:projectId/scope-changes', async (request, response) => {
  const ownerId = getAuthenticatedUser(request).id
  const { projectId } = projectParamsSchema.parse(request.params)
  const input = createScopeChangeSchema.parse(request.body)
  const project = await prisma.project.findFirst({
    where: { id: projectId, ownerId },
    select: { id: true },
  })
  if (!project) throw new HttpError(404, 'Project not found')

  const scopeChange = await prisma.scopeChange.create({
    data: {
      projectId,
      originalRequirement: input.originalRequirement,
      newRequirement: input.newRequirement,
      aiAnalysis: (input.aiAnalysis ?? null) as any,
      status: input.status,
    },
  })

  response.status(201).json(scopeChange)
})

  return projectsRouter
}
