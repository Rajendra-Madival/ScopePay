import type { ErrorRequestHandler, RequestHandler } from 'express'
import { Prisma } from '../../generated/prisma/client.js'
import { ZodError } from 'zod'

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'HttpError'
  }
}

export const notFoundHandler: RequestHandler = (_request, response) => {
  response.status(404).json({ error: 'Route not found' })
}

export const errorHandler: ErrorRequestHandler = (error: unknown, _request, response, _next) => {
  if (error instanceof ZodError) {
    response.status(400).json({
      error: 'Request validation failed',
      issues: error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    })
    return
  }

  if (error instanceof HttpError) {
    response.status(error.status).json({ error: error.message })
    return
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2025') {
      response.status(404).json({ error: 'Resource not found' })
      return
    }
    if (error.code === 'P2002') {
      response.status(409).json({ error: 'A resource with that unique value already exists' })
      return
    }
    if (error.code === 'P2003') {
      response.status(409).json({ error: 'The resource is referenced by another record' })
      return
    }
  }

  if (
    error instanceof SyntaxError &&
    'status' in error &&
    error.status === 400
  ) {
    response.status(400).json({ error: 'Request body contains invalid JSON' })
    return
  }

  console.error(error)
  response.status(500).json({ error: 'Internal server error' })
}
