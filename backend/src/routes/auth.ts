import { Router } from 'express'
import type { Request, RequestHandler, Response } from 'express'
import { z } from 'zod'
import type { Database } from '../config/database.js'
import { prisma } from '../config/database.js'
import { env } from '../config/env.js'
import { getAuthenticatedUser, requireAuth, requireCsrf, requireSameOrigin } from '../middleware/auth.js'
import { HttpError } from '../middleware/errors.js'
import {
  createCsrfTokenHash,
  createOpaqueToken,
  DUMMY_PASSWORD_HASH,
  hashOpaqueToken,
  hashPassword,
  needsPasswordRehash,
  PASSWORD_RESET_TTL_MS,
  SESSION_TTL_MS,
  verifyPassword,
} from '../services/auth.js'
import { createPasswordResetMailer } from '../services/passwordResetEmail.js'
import type { PasswordResetMailer } from '../services/passwordResetEmail.js'

const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.email().trim().max(254),
  password: z.string().min(12).max(128),
}).strict()

const loginSchema = z.object({
  email: z.email().trim().max(254),
  password: z.string().min(1).max(128),
}).strict()

const forgotPasswordSchema = z.object({
  email: z.email().trim().max(254),
}).strict()

const resetPasswordSchema = z.object({
  token: z.string().min(32).max(128),
  password: z.string().min(12).max(128),
}).strict()

const profileSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  email: z.email().trim().max(254).optional(),
}).strict()

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(12).max(128),
}).strict()

const cookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
}

function createRateLimit(maxRequests: number, windowMs: number) {
  const attempts = new Map<string, { count: number; resetAt: number }>()

  const rateLimit: RequestHandler = (request, response, next) => {
    const now = Date.now()
    const key = request.ip ?? 'unknown'
    let entry = attempts.get(key)
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs }
      attempts.set(key, entry)
    }

    entry.count += 1
    if (entry.count > maxRequests) {
      response.setHeader('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)))
      response.status(429).json({ error: 'Too many authentication attempts. Please try again later.' })
      return
    }

    if (attempts.size > 2000) {
      for (const [attemptKey, attempt] of attempts) {
        if (attempt.resetAt <= now) attempts.delete(attemptKey)
      }
    }
    next()
  }
  return rateLimit
}

async function startSession(
  database: Database,
  response: Response,
  user: { id: string; name: string; email: string },
) {
  const token = createOpaqueToken()
  const csrfToken = createOpaqueToken()
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)
  await database.authSession.create({
    data: {
      userId: user.id,
      tokenHash: hashOpaqueToken(token),
      csrfHash: createCsrfTokenHash(csrfToken),
      expiresAt,
    },
  })

  response.cookie('scopepay_session', token, {
    ...cookieOptions,
    maxAge: SESSION_TTL_MS,
  })
  response.cookie('scopepay_csrf', csrfToken, {
    ...cookieOptions,
    httpOnly: false,
    maxAge: SESSION_TTL_MS,
  })
}

function clearSessionCookies(response: import('express').Response) {
  response.clearCookie('scopepay_session', cookieOptions)
  response.clearCookie('scopepay_csrf', { ...cookieOptions, httpOnly: false })
}

function normalizedEmail(email: string) {
  return email.toLowerCase()
}

export function createAuthRouter(
  database: Database = prisma,
  options: { mailer?: PasswordResetMailer | null } = {},
) {
  const authRouter = Router()
  const requireCurrentAuth = requireAuth(database)
  const sendPasswordResetEmail = options.mailer === undefined
    ? createPasswordResetMailer()
    : options.mailer

  const register = async (request: Request, response: Response) => {
    const input = registerSchema.parse(request.body)
    const email = normalizedEmail(input.email)
    const existing = await database.user.findUnique({ where: { email }, select: { id: true } })
    if (existing) throw new HttpError(409, 'An account already exists for that email')

    const user = await database.user.create({
      data: {
        name: input.name,
        email,
        passwordHash: await hashPassword(input.password),
      },
      select: { id: true, name: true, email: true },
    })

    await startSession(database, response, user)
    response.status(201).json({ user })
  }

  authRouter.post(
    ['/register', '/signup'],
    createRateLimit(5, 15 * 60 * 1000),
    requireSameOrigin,
    register,
  )

  authRouter.post(
    '/login',
    createRateLimit(10, 15 * 60 * 1000),
    requireSameOrigin,
    async (request, response) => {
      const input = loginSchema.parse(request.body)
      const email = normalizedEmail(input.email)
      const user = await database.user.findUnique({ where: { email } })
      const passwordValid = user
        ? await verifyPassword(input.password, user.passwordHash)
        : await verifyPassword(input.password, DUMMY_PASSWORD_HASH)

      if (!user || !passwordValid) {
        throw new HttpError(401, 'Invalid email or password')
      }

      if (needsPasswordRehash(user.passwordHash)) {
        await database.user.update({
          where: { id: user.id },
          data: { passwordHash: await hashPassword(input.password) },
        })
      }

      const sessionUser = { id: user.id, name: user.name, email: user.email }
      await startSession(database, response, sessionUser)
      response.json({ user: sessionUser })
    },
  )

  authRouter.post(
    '/logout',
    requireCurrentAuth,
    requireCsrf,
    async (request, response) => {
      if (!request.authSession) throw new HttpError(401, 'Authentication required')
      await database.authSession.deleteMany({ where: { id: request.authSession.id } })
      clearSessionCookies(response)
      response.status(204).end()
    },
  )

  authRouter.get('/me', requireCurrentAuth, async (request, response) => {
    const user = getAuthenticatedUser(request)
    const currentUser = await database.user.findUnique({
      where: { id: user.id },
      select: { id: true, name: true, email: true },
    })
    if (!currentUser) throw new HttpError(401, 'Authentication required')
    response.json({ user: currentUser })
  })

  authRouter.post(
    '/forgot-password',
    createRateLimit(5, 15 * 60 * 1000),
    requireSameOrigin,
    async (request, response) => {
      const { email: submittedEmail } = forgotPasswordSchema.parse(request.body)
      if (!sendPasswordResetEmail) {
        throw new HttpError(503, 'Password recovery is not configured. Contact the workspace administrator.')
      }

      const email = normalizedEmail(submittedEmail)
      const user = await database.user.findUnique({
        where: { email },
        select: { id: true, email: true },
      })

      if (user) {
        const token = createOpaqueToken()
        await database.passwordResetToken.deleteMany({
          where: { userId: user.id, usedAt: null },
        })
        await database.passwordResetToken.create({
          data: {
            userId: user.id,
            tokenHash: hashOpaqueToken(token),
            expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
          },
        })

        const resetUrl = new URL('/reset-password', `${env.FRONTEND_ORIGIN}/`)
        resetUrl.searchParams.set('token', token)
        try {
          await sendPasswordResetEmail(user.email, resetUrl.toString())
        } catch (error) {
          await database.passwordResetToken.deleteMany({
            where: { userId: user.id, tokenHash: hashOpaqueToken(token) },
          })
          console.error('Password reset email delivery failed', error)
          throw new HttpError(503, 'Password recovery is temporarily unavailable. Please try again later.')
        }
      }

      response.status(202).json({
        message: 'If an account exists for that email, password reset instructions will be sent.',
      })
    },
  )

  authRouter.post(
    '/reset-password',
    createRateLimit(10, 15 * 60 * 1000),
    requireSameOrigin,
    async (request, response) => {
      const input = resetPasswordSchema.parse(request.body)
      const passwordHash = await hashPassword(input.password)
      const tokenHash = hashOpaqueToken(input.token)

      await database.$transaction(async (transaction) => {
        const resetToken = await transaction.passwordResetToken.findUnique({
          where: { tokenHash },
          select: { id: true, userId: true, expiresAt: true, usedAt: true },
        })
        if (!resetToken || resetToken.usedAt || resetToken.expiresAt <= new Date()) {
          throw new HttpError(400, 'Password reset link is invalid or expired')
        }

        const claimed = await transaction.passwordResetToken.updateMany({
          where: { id: resetToken.id, usedAt: null, expiresAt: { gt: new Date() } },
          data: { usedAt: new Date() },
        })
        if (claimed.count !== 1) {
          throw new HttpError(400, 'Password reset link is invalid or expired')
        }

        await transaction.user.update({
          where: { id: resetToken.userId },
          data: { passwordHash },
        })
        await transaction.authSession.deleteMany({ where: { userId: resetToken.userId } })
        await transaction.passwordResetToken.deleteMany({
          where: { userId: resetToken.userId, id: { not: resetToken.id } },
        })
      })

      clearSessionCookies(response)
      response.json({ message: 'Password reset successfully. Please log in with your new password.' })
    },
  )

  authRouter.patch(
    '/profile',
    requireCurrentAuth,
    requireCsrf,
    async (request, response) => {
      const user = getAuthenticatedUser(request)
      const input = profileSchema.parse(request.body)
      if (Object.keys(input).length === 0) {
        throw new HttpError(400, 'At least one profile field is required')
      }

      const updatedUser = await database.user.update({
        where: { id: user.id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.email !== undefined ? { email: normalizedEmail(input.email) } : {}),
        },
        select: { id: true, name: true, email: true },
      })
      response.json({ user: updatedUser })
    },
  )

  authRouter.patch(
    '/change-password',
    requireCurrentAuth,
    requireCsrf,
    async (request, response) => {
      const user = getAuthenticatedUser(request)
      const input = changePasswordSchema.parse(request.body)
      const current = await database.user.findUnique({
        where: { id: user.id },
        select: { passwordHash: true },
      })
      if (!current || !(await verifyPassword(input.currentPassword, current.passwordHash))) {
        throw new HttpError(401, 'Current password is incorrect')
      }
      if (input.currentPassword === input.newPassword) {
        throw new HttpError(400, 'New password must be different from the current password')
      }

      const passwordHash = await hashPassword(input.newPassword)
      const sessionUser = await database.$transaction(async (transaction) => {
        const updatedUser = await transaction.user.update({
          where: { id: user.id },
          data: { passwordHash },
          select: { id: true, name: true, email: true },
        })
        await transaction.authSession.deleteMany({ where: { userId: user.id } })
        await transaction.passwordResetToken.deleteMany({ where: { userId: user.id } })
        return updatedUser
      })

      await startSession(database, response, sessionUser)
      response.json({ user: sessionUser })
    },
  )

  return authRouter
}
