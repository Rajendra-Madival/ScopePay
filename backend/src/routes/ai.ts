import { Router } from 'express'
import type { RequestHandler } from 'express'
import { getAuthenticatedUser } from '../middleware/auth.js'
import type { ProjectPlanner } from '../services/geminiProjectPlanner.js'
import { analyzeProjectInputSchema } from '../validation/projectPlan.js'

export function createAiRouter(planProject: ProjectPlanner) {
  const router = Router()
  const attempts = new Map<string, { count: number; resetAt: number }>()

  const rateLimit: RequestHandler = (request, response, next) => {
    const userId = getAuthenticatedUser(request).id
    const now = Date.now()
    let entry = attempts.get(userId)
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + 60_000 }
      attempts.set(userId, entry)
    }
    entry.count += 1
    if (entry.count > 5) {
      response.setHeader('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)))
      response.status(429).json({ error: 'Too many project plan requests. Please try again later.' })
      return
    }
    if (attempts.size > 2000) {
      for (const [key, value] of attempts) {
        if (value.resetAt <= now) attempts.delete(key)
      }
    }
    next()
  }

  router.post('/analyze-project', rateLimit, async (request, response) => {
    const input = analyzeProjectInputSchema.parse(request.body)
    response.json(await planProject(input))
  })

  return router
}
