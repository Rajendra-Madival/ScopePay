import { Router } from 'express'
import type { Database } from '../config/database.js'
import { getAuthenticatedUser } from '../middleware/auth.js'
import { HttpError } from '../middleware/errors.js'
import { idParamsSchema, updateScopeChangeSchema } from '../validation/schemas.js'

export function createScopeChangesRouter(prisma: Database) {
  const scopeChangesRouter = Router()

  scopeChangesRouter.get('/', async (request, response) => {
    const ownerId = getAuthenticatedUser(request).id
    const scopeChanges = await prisma.scopeChange.findMany({
      where: { project: { ownerId } },
      include: { project: { select: { id: true, title: true, clientName: true } } },
      orderBy: { createdAt: 'desc' },
    })
    response.json(scopeChanges)
  })

  scopeChangesRouter.patch('/:id', async (request, response) => {
    const ownerId = getAuthenticatedUser(request).id
    const { id } = idParamsSchema.parse(request.params)
    const input = updateScopeChangeSchema.parse(request.body)
    if (Object.keys(input).length === 0) {
      throw new HttpError(400, 'At least one scope change field is required')
    }

    const asExisting = await prisma.scopeChange.findFirst({
      where: { id, project: { ownerId } },
      select: { id: true },
    })
    if (!asExisting) throw new HttpError(404, 'Scope change not found')

    const updated = await prisma.scopeChange.updateMany({
      where: { id, project: { ownerId } },
      data: {
        ...input,
        aiAnalysis: input.aiAnalysis as any,
      },
    })
    if (updated.count !== 1) throw new HttpError(404, 'Scope change not found')
    const scopeChange = await prisma.scopeChange.findFirst({
      where: { id, project: { ownerId } },
    })

    response.json(scopeChange)
  })

  scopeChangesRouter.delete('/:id', async (request, response) => {
    const ownerId = getAuthenticatedUser(request).id
    const { id } = idParamsSchema.parse(request.params)
    const scopeChange = await prisma.scopeChange.findFirst({
      where: { id, project: { ownerId } },
      select: { id: true },
    })
    if (!scopeChange) throw new HttpError(404, 'Scope change not found')

    await prisma.scopeChange.deleteMany({ where: { id, project: { ownerId } } })
    response.status(204).end()
  })

  return scopeChangesRouter
}
