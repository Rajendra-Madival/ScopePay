import cors from 'cors'
import express from 'express'
import { prisma, type Database } from './config/database.js'
import { env } from './config/env.js'
import { errorHandler, notFoundHandler } from './middleware/errors.js'
import { createMilestonesRouter } from './routes/milestones.js'
import { createPaymentsRouter } from './routes/payments.js'
import { createPaypalRouter } from './routes/paypal.js'
import { createProjectsRouter } from './routes/projects.js'
import { createPaypalClient } from './services/paypalClient.js'
import { createPaypalRepository } from './services/paypalRepository.js'

export function createApp(database: Database = prisma) {
  const app = express()

  app.disable('x-powered-by')
  app.use(cors({ origin: env.FRONTEND_ORIGIN }))
  app.use(express.json({ limit: '1mb' }))
  app.get('/api/health', (_request, response) => response.json({ status: 'ok' }))
  app.use('/api/projects', createProjectsRouter(database))
  app.use('/api/milestones', createMilestonesRouter(database))
  app.use('/api/payments', createPaymentsRouter(database))
  app.use('/api/paypal', createPaypalRouter(createPaypalRepository(database), createPaypalClient()))
  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
