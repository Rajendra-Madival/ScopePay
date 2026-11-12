import cors from 'cors'
import express from 'express'
import { Router } from 'express'
import { prisma, type Database } from './config/database.js'
import { env } from './config/env.js'
import { requireAuth, requireCsrf, requireSameOrigin } from './middleware/auth.js'
import { errorHandler, notFoundHandler } from './middleware/errors.js'
import { createMilestonesRouter } from './routes/milestones.js'
import { createAuthRouter } from './routes/auth.js'
import { createAiRouter } from './routes/ai.js'
import { createPaymentsRouter } from './routes/payments.js'
import { createPaypalRouter } from './routes/paypal.js'
import { createProjectsRouter } from './routes/projects.js'
import { createScopeChangesRouter } from './routes/scopeChanges.js'
import { createOpenAiScopeAnalyzer } from './services/openAiScopeAnalyzer.js'
import { createPaypalClient } from './services/paypalClient.js'
import { createPaypalRepository } from './services/paypalRepository.js'
import { createGeminiProjectPlanner } from './services/geminiProjectPlanner.js'

export function createApp(database: Database = prisma) {
  const app = express()
  const protectedRouter = (router: Router) => {
    const secured = Router()
    secured.use(requireAuth(database))
    secured.use((request, response, next) => {
      if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
        next()
        return
      }
      requireCsrf(request, response, next)
    })
    secured.use(router)
    return secured
  }

  app.disable('x-powered-by')
  if (env.NODE_ENV === 'production') app.set('trust proxy', 1)
  app.use((request, response, next) => {
    if (env.NODE_ENV === 'production' && !request.secure) {
      response.status(400).json({ error: 'HTTPS is required' })
      return
    }
    next()
  })
  app.use(cors({
    origin: env.FRONTEND_ORIGIN,
    credentials: true,
    allowedHeaders: ['Content-Type', 'X-CSRF-Token'],
  }))
  app.use(express.json({ limit: '1mb' }))
  app.use((request, response, next) => {
    response.setHeader('Referrer-Policy', 'no-referrer')
    response.setHeader('X-Content-Type-Options', 'nosniff')
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      requireSameOrigin(request, response, next)
      return
    }
    next()
  })
  app.get('/api/health', (_request, response) => response.json({ status: 'ok' }))
  app.use('/api/auth', createAuthRouter(database))
  app.use('/api/ai', protectedRouter(createAiRouter(createGeminiProjectPlanner())))
  app.use('/api/projects', protectedRouter(createProjectsRouter(database, createOpenAiScopeAnalyzer())))
  app.use('/api/milestones', protectedRouter(createMilestonesRouter(database)))
  app.use('/api/payments', protectedRouter(createPaymentsRouter(database)))
  app.use('/api/scope-changes', protectedRouter(createScopeChangesRouter(database)))
  app.use('/api/paypal', protectedRouter(
    createPaypalRouter(createPaypalRepository(database), createPaypalClient()),
  ))
  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
