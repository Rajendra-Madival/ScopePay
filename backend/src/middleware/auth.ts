import type { Request, RequestHandler } from 'express'
import type { Database } from '../config/database.js'
import { prisma } from '../config/database.js'
import { env } from '../config/env.js'
import { HttpError } from './errors.js'
import { createCsrfTokenHash, hashOpaqueToken, safeEqual } from '../services/auth.js'

export type AuthenticatedUser = {
  id: string
  name: string
  email: string
}

export type AuthSessionContext = {
  id: string
  tokenHash: string
  csrfHash: string
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser
      authSession?: AuthSessionContext
    }
  }
}

export function readCookie(request: Request, name: string) {
  const cookies = request.headers.cookie?.split(';') ?? []
  for (const cookie of cookies) {
    const separator = cookie.indexOf('=')
    if (separator < 0 || cookie.slice(0, separator).trim() !== name) continue
    return cookie.slice(separator + 1).trim()
  }
  return undefined
}

export function requireAuth(database: Database = prisma): RequestHandler {
  return async (request, _response, next) => {
    const rawToken = readCookie(request, 'scopepay_session')
    if (!rawToken) throw new HttpError(401, 'Authentication required')

    const tokenHash = hashOpaqueToken(rawToken)
    const session = await database.authSession.findUnique({
      where: { tokenHash },
      include: { user: { select: { id: true, name: true, email: true } } },
    })
    if (!session || session.expiresAt <= new Date()) {
      if (session) {
        await database.authSession.deleteMany({ where: { id: session.id } })
      }
      throw new HttpError(401, 'Authentication required')
    }

    request.user = session.user
    request.authSession = {
      id: session.id,
      tokenHash,
      csrfHash: session.csrfHash,
    }
    next()
  }
}

export const requireCsrf: RequestHandler = (request, _response, next) => {
  const csrfCookie = readCookie(request, 'scopepay_csrf')
  const csrfHeader = request.get('x-csrf-token')
  const session = request.authSession
  if (
    !csrfCookie ||
    !csrfHeader ||
    !session ||
    !safeEqual(csrfCookie, csrfHeader) ||
    !safeEqual(createCsrfTokenHash(csrfCookie), session.csrfHash)
  ) {
    throw new HttpError(403, 'Invalid CSRF token')
  }
  next()
}

export const requireSameOrigin: RequestHandler = (request, _response, next) => {
  const origin = request.get('origin')
  if (origin !== env.FRONTEND_ORIGIN) {
    throw new HttpError(403, 'Request origin is not allowed')
  }
  next()
}

export function getAuthenticatedUser(request: Request) {
  if (!request.user) throw new HttpError(401, 'Authentication required')
  return request.user
}
