import assert from 'node:assert/strict'
import { test } from 'node:test'
import express from 'express'
import request from 'supertest'

process.env.DATABASE_URL ??= 'postgresql://test:test@127.0.0.1:5432/scopepay_test'
process.env.FRONTEND_ORIGIN ??= 'http://localhost:5173'
process.env.NODE_ENV ??= 'test'

const { createApp } = await import('../src/app.js')
const { createAuthRouter } = await import('../src/routes/auth.js')
const { errorHandler } = await import('../src/middleware/errors.js')
const { hashOpaqueToken } = await import('../src/services/auth.js')
const { requireSameOrigin } = await import('../src/middleware/auth.js')
const { env } = await import('../src/config/env.js')

type TestUser = {
  id: string
  name: string
  email: string
  passwordHash: string
  role: string
}

type TestProject = {
  id: string
  ownerId: string | null
  title: string
  clientName: string
  clientEmail: string
  description: string
  budget: number
  currency: string
  createdAt: Date
  updatedAt: Date
}

function createDatabase() {
  const state = {
    users: [] as TestUser[],
    sessions: [] as {
      id: string
      userId: string
      tokenHash: string
      csrfHash: string
      expiresAt: Date
      createdAt: Date
    }[],
    resetTokens: [] as {
      id: string
      userId: string
      tokenHash: string
      expiresAt: Date
      usedAt: Date | null
      createdAt: Date
    }[],
    projects: [] as TestProject[],
    milestones: [] as Record<string, unknown>[],
    payments: [] as Record<string, unknown>[],
    scopeChanges: [] as Record<string, unknown>[],
  }

  function projectFor(projectId: string) {
    return state.projects.find((project) => project.id === projectId)
  }

  function ownerMatchesProject(projectId: string, ownerId: string) {
    return projectFor(projectId)?.ownerId === ownerId
  }

  function ownerMatchesMilestone(milestoneId: string, ownerId: string) {
    const milestone = state.milestones.find((item) => item.id === milestoneId)
    return Boolean(milestone && ownerMatchesProject(String(milestone.projectId), ownerId))
  }

  function ownerMatchesPayment(payment: Record<string, unknown>, ownerId: string) {
    return ownerMatchesMilestone(String(payment.milestoneId), ownerId)
  }

  function matchesProject(project: TestProject, where: Record<string, unknown> = {}) {
    return (!where.id || project.id === where.id) &&
      (!where.ownerId || project.ownerId === where.ownerId)
  }

  function matchesMilestone(milestone: Record<string, unknown>, where: Record<string, unknown> = {}) {
    const projectFilter = where.project as { ownerId?: string } | undefined
    return (!where.id || milestone.id === where.id) &&
      (!where.projectId || milestone.projectId === where.projectId) &&
      (!projectFilter?.ownerId || ownerMatchesMilestone(String(milestone.id), projectFilter.ownerId))
  }

  function matchesPayment(payment: Record<string, unknown>, where: Record<string, unknown> = {}) {
    const milestoneFilter = where.milestone as {
      projectId?: string
      project?: { ownerId?: string }
    } | undefined
    const ownerId = milestoneFilter?.project?.ownerId
    const milestoneId = String(payment.milestoneId)
    const milestone = state.milestones.find((item) => item.id === milestoneId)
    const statusFilter = where.status as { not?: string } | undefined
    return (!where.id || payment.id === where.id) &&
      (!where.paypalOrderId || payment.paypalOrderId === where.paypalOrderId) &&
      (!where.milestoneId || payment.milestoneId === where.milestoneId) &&
      (!statusFilter?.not || payment.status !== statusFilter.not) &&
      (!milestoneFilter?.projectId || milestone?.projectId === milestoneFilter.projectId) &&
      (!ownerId || ownerMatchesPayment(payment, ownerId))
  }

  function selectUser<T extends TestUser>(user: T, select?: Record<string, boolean>) {
    if (!select) return user
    return Object.fromEntries(
      Object.entries(select)
        .filter(([, include]) => include)
        .map(([key]) => [key, user[key as keyof TestUser]]),
    )
  }

  const database = {
    user: {
      findUnique: async ({ where, select }: {
        where: { id?: string; email?: string }
        select?: Record<string, boolean>
      }) => {
        const user = state.users.find((user) =>
          where.id ? user.id === where.id : user.email === where.email,
        )
        return user ? selectUser(user, select) : null
      },
      create: async ({ data, select }: {
        data: Omit<TestUser, 'id' | 'role'> & { role?: string }
        select?: Record<string, boolean>
      }) => {
        const user = { id: `user-${state.users.length + 1}`, role: 'member', ...data }
        state.users.push(user)
        return selectUser(user, select)
      },
      update: async ({ where, data, select }: {
        where: { id: string }
        data: Partial<TestUser>
        select?: Record<string, boolean>
      }) => {
        const user = state.users.find((item) => item.id === where.id)
        if (!user) throw new Error('user not found')
        Object.assign(user, data)
        return selectUser(user, select)
      },
    },
    authSession: {
      create: async ({ data }: { data: Omit<(typeof state.sessions)[number], 'id' | 'createdAt'> }) => {
        const session = { id: `session-${state.sessions.length + 1}`, createdAt: new Date(), ...data }
        state.sessions.push(session)
        return session
      },
      findUnique: async ({ where }: { where: { tokenHash: string } }) => {
        const session = state.sessions.find((item) => item.tokenHash === where.tokenHash)
        const user = session && state.users.find((item) => item.id === session.userId)
        return session && user ? { ...session, user: { id: user.id, name: user.name, email: user.email } } : null
      },
      deleteMany: async ({ where }: { where: { id?: string; userId?: string } }) => {
        const before = state.sessions.length
        state.sessions = state.sessions.filter((item) =>
          (where.id && item.id !== where.id) ||
          (where.userId && item.userId !== where.userId),
        )
        return { count: before - state.sessions.length }
      },
    },
    passwordResetToken: {
      findUnique: async ({ where }: { where: { tokenHash: string } }) =>
        state.resetTokens.find((item) => item.tokenHash === where.tokenHash) ?? null,
      create: async ({ data }: { data: Omit<(typeof state.resetTokens)[number], 'id' | 'createdAt' | 'usedAt'> }) => {
        const token = { id: `reset-${state.resetTokens.length + 1}`, usedAt: null, createdAt: new Date(), ...data }
        state.resetTokens.push(token)
        return token
      },
      updateMany: async ({ where, data }: {
        where: { id: string; usedAt: null; expiresAt: { gt: Date } }
        data: { usedAt: Date }
      }) => {
        const token = state.resetTokens.find((item) =>
          item.id === where.id && item.usedAt === null && item.expiresAt > where.expiresAt.gt,
        )
        if (!token) return { count: 0 }
        Object.assign(token, data)
        return { count: 1 }
      },
      deleteMany: async ({ where }: {
        where: { userId: string; usedAt?: null; tokenHash?: string; id?: { not: string } }
      }) => {
        const before = state.resetTokens.length
        state.resetTokens = state.resetTokens.filter((item) => {
          if (item.userId !== where.userId) return true
          if (where.usedAt === null && item.usedAt !== null) return true
          if (where.tokenHash && item.tokenHash !== where.tokenHash) return true
          if (where.id?.not && item.id === where.id.not) return true
          return false
        })
        return { count: before - state.resetTokens.length }
      },
    },
    project: {
      findMany: async ({ where }: { where: Record<string, unknown> }) =>
        state.projects.filter((project) => matchesProject(project, where)).map((project) => ({
          ...project,
          milestones: state.milestones.filter((item) => item.projectId === project.id),
          scopeChanges: state.scopeChanges.filter((item) => item.projectId === project.id),
        })),
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        state.projects.find((project) => matchesProject(project, where)) ?? null,
      create: async ({ data }: { data: Omit<TestProject, 'id' | 'createdAt' | 'updatedAt'> }) => {
        const project = {
          id: `project-${state.projects.length + 1}`,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        }
        state.projects.push(project)
        return project
      },
      updateMany: async ({ where, data }: {
        where: { id: string; ownerId: string }
        data: Partial<TestProject>
      }) => {
        const project = state.projects.find((item) => matchesProject(item, where))
        if (!project) return { count: 0 }
        Object.assign(project, data)
        return { count: 1 }
      },
      deleteMany: async ({ where }: { where: { id: string; ownerId: string } }) => {
        const index = state.projects.findIndex((project) => matchesProject(project, where))
        if (index < 0) return { count: 0 }
        state.projects.splice(index, 1)
        return { count: 1 }
      },
    },
    milestone: {
      findMany: async ({ where }: { where: { project: { ownerId: string } } }) =>
        state.milestones.filter((item) => matchesMilestone(item, where)),
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        const milestone = state.milestones.find((item) => matchesMilestone(item, where))
        return milestone ?? null
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const milestone = { id: `milestone-${state.milestones.length + 1}`, ...data }
        state.milestones.push(milestone)
        return milestone
      },
      updateMany: async ({ where, data }: {
        where: { id: string; project?: { ownerId: string } }
        data: Record<string, unknown>
      }) => {
        const milestone = state.milestones.find((item) => matchesMilestone(item, where))
        if (!milestone) return { count: 0 }
        Object.assign(milestone, data)
        return { count: 1 }
      },
      deleteMany: async ({ where }: { where: { id: string; project: { ownerId: string } } }) => {
        const index = state.milestones.findIndex((item) => matchesMilestone(item, where))
        if (index < 0) return { count: 0 }
        state.milestones.splice(index, 1)
        return { count: 1 }
      },
    },
    payment: {
      findMany: async ({ where }: { where: Record<string, unknown> }) =>
        state.payments.filter((payment) => matchesPayment(payment, where)),
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        state.payments.find((payment) => matchesPayment(payment, where)) ?? null,
      updateMany: async ({ where, data }: {
        where: Record<string, unknown>
        data: Record<string, unknown>
      }) => {
        const payment = state.payments.find((item) => matchesPayment(item, where))
        if (!payment) return { count: 0 }
        Object.assign(payment, data)
        return { count: 1 }
      },
      deleteMany: async ({ where }: { where: Record<string, unknown> }) => {
        const before = state.payments.length
        state.payments = state.payments.filter((item) => !matchesPayment(item, where))
        return { count: before - state.payments.length }
      },
    },
    scopeChange: {
      findMany: async ({ where }: { where: { project: { ownerId: string } } }) =>
        state.scopeChanges.filter((item) => ownerMatchesProject(
          String(item.projectId),
          where.project.ownerId,
        )),
      findFirst: async ({ where }: { where: { id: string; project?: { ownerId: string } } }) => {
        const change = state.scopeChanges.find((item) => item.id === where.id)
        if (!change) return null
        if (where.project?.ownerId && !ownerMatchesProject(String(change.projectId), where.project.ownerId)) return null
        return change
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const change = { id: `scope-${state.scopeChanges.length + 1}`, ...data }
        state.scopeChanges.push(change)
        return change
      },
      updateMany: async ({ where, data }: {
        where: { id: string; project?: { ownerId: string } }
        data: Record<string, unknown>
      }) => {
        const change = state.scopeChanges.find((item) => item.id === where.id)
        if (!change || (where.project?.ownerId && !ownerMatchesProject(String(change.projectId), where.project.ownerId))) {
          return { count: 0 }
        }
        Object.assign(change, data)
        return { count: 1 }
      },
      deleteMany: async ({ where }: { where: { id: string; project: { ownerId: string } } }) => {
        const index = state.scopeChanges.findIndex((item) =>
          item.id === where.id && ownerMatchesProject(String(item.projectId), where.project.ownerId),
        )
        if (index < 0) return { count: 0 }
        state.scopeChanges.splice(index, 1)
        return { count: 1 }
      },
    },
    async $queryRaw(strings: TemplateStringsArray, ...values: string[]) {
      const query = strings.join('?')
      if (query.includes('FROM "Project"')) {
        const [id, ownerId] = values
        const project = state.projects.find((item) => item.id === id && item.ownerId === ownerId)
        return project ? [{ id: project.id, currency: project.currency }] : []
      }
      if (query.includes('FROM "Milestone"')) {
        const [id, ownerId] = values
        const milestone = state.milestones.find((item) =>
          item.id === id && ownerMatchesMilestone(String(id), ownerId ?? ''),
        )
        return milestone ? [{ id: milestone.id, status: milestone.status }] : []
      }
      return []
    },
    async $transaction<T>(callback: (transaction: typeof database) => Promise<T>) {
      return callback(database)
    },
  }

  return { database: database as never, state }
}

const origin = 'http://localhost:5173'

function cookieValue(response: request.Response, name: string) {
  const cookies = response.headers['set-cookie'] as string[] | undefined
  const cookie = cookies?.find((value) => value.startsWith(`${name}=`))
  return cookie?.split(';', 1)[0]?.slice(name.length + 1) ?? ''
}

function withOrigin<T extends request.Test>(testRequest: T) {
  return testRequest.set('Origin', origin)
}

test('allows originless local API clients but keeps the production origin check strict', async () => {
  const originalNodeEnvironment = env.NODE_ENV
  const app = express()
  app.post('/mutate', requireSameOrigin, (_request, response) => response.sendStatus(204))
  app.use(errorHandler)

  try {
    env.NODE_ENV = 'test'
    await request(app).post('/mutate').expect(204)
    await withOrigin(request(app).post('/mutate')).expect(204)
    await request(app).post('/mutate').set('Origin', 'https://untrusted.example').expect(403)

    env.NODE_ENV = 'production'
    await request(app).post('/mutate').expect(403)
    await withOrigin(request(app).post('/mutate')).expect(204)
    await request(app).post('/mutate').set('Origin', 'https://untrusted.example').expect(403)
  } finally {
    env.NODE_ENV = originalNodeEnvironment
  }
})

test('registers safely, rejects duplicate emails, and logs in only with the correct password', async () => {
  const { database, state } = createDatabase()
  const app = express()
  app.use(express.json())
  app.use('/api/auth', createAuthRouter(database))
  app.use(errorHandler)
  const agent = request.agent(app)

  const registration = await withOrigin(agent.post('/api/auth/register'))
    .send({ name: 'Owner One', email: 'OWNER@example.com', password: 'secure-password-1' })
  assert.equal(registration.status, 201)
  assert.deepEqual(registration.body.user, {
    id: 'user-1',
    name: 'Owner One',
    email: 'owner@example.com',
  })
  assert.equal('passwordHash' in registration.body.user, false)
  assert.match(state.users[0]!.passwordHash, /^\$2/)
  assert.notEqual(state.users[0]!.passwordHash, 'secure-password-1')
  assert.ok(cookieValue(registration, 'scopepay_session'))
  assert.ok(cookieValue(registration, 'scopepay_csrf'))
  const responseCookies = registration.headers['set-cookie'] as string[]
  assert.match(responseCookies.find((value) => value.startsWith('scopepay_session=')) ?? '', /HttpOnly/i)
  assert.match(responseCookies.find((value) => value.startsWith('scopepay_session=')) ?? '', /SameSite=Lax/i)
  assert.doesNotMatch(responseCookies.find((value) => value.startsWith('scopepay_csrf=')) ?? '', /HttpOnly/i)

  const duplicate = await withOrigin(agent.post('/api/auth/register'))
    .send({ name: 'Another Owner', email: 'owner@example.com', password: 'secure-password-2' })
  assert.equal(duplicate.status, 409)

  const incorrect = await withOrigin(request(app).post('/api/auth/login'))
    .send({ email: 'owner@example.com', password: 'incorrect-password' })
  assert.equal(incorrect.status, 401)

  const login = await withOrigin(request(app).post('/api/auth/login'))
    .send({ email: 'owner@example.com', password: 'secure-password-1' })
  assert.equal(login.status, 200)
  assert.equal(login.body.user.email, 'owner@example.com')
  assert.equal('passwordHash' in login.body.user, false)
  assert.equal('token' in login.body, false)

  const longPassword = `${'a'.repeat(80)}-suffix-one`
  const longPasswordAccount = await withOrigin(request(app).post('/api/auth/register'))
    .send({ name: 'Long Password', email: 'long-password@example.com', password: longPassword })
  assert.equal(longPasswordAccount.status, 201)
  const changedSuffix = await withOrigin(request(app).post('/api/auth/login'))
    .send({ email: 'long-password@example.com', password: `${'a'.repeat(80)}-suffix-two` })
  assert.equal(changedSuffix.status, 401)
})

test('persists cookie sessions, rejects expired sessions, and invalidates logout', async () => {
  const { database, state } = createDatabase()
  const app = express()
  app.use(express.json())
  app.use('/api/auth', createAuthRouter(database))
  app.use(errorHandler)
  const agent = request.agent(app)

  const registration = await withOrigin(agent.post('/api/auth/register'))
    .send({ name: 'Session Owner', email: 'session@example.com', password: 'secure-password-1' })
  const sessionCookie = cookieValue(registration, 'scopepay_session')
  const csrfToken = cookieValue(registration, 'scopepay_csrf')
  assert.equal((await agent.get('/api/auth/me')).status, 200)
  assert.equal((await agent.get('/api/auth/me')).status, 200)

  const logout = await withOrigin(agent.post('/api/auth/logout'))
    .set('X-CSRF-Token', csrfToken)
  assert.equal(logout.status, 204)
  assert.equal((await agent.get('/api/auth/me')).status, 401)

  const expiredAgent = request.agent(app)
  const expiredRegistration = await withOrigin(expiredAgent.post('/api/auth/register'))
    .send({ name: 'Expired Owner', email: 'expired@example.com', password: 'secure-password-2' })
  const expiredToken = cookieValue(expiredRegistration, 'scopepay_session')
  const storedSession = state.sessions.find((session) =>
    session.tokenHash === hashOpaqueToken(expiredToken),
  )
  assert.ok(storedSession)
  storedSession.expiresAt = new Date(Date.now() - 1000)
  assert.equal((await expiredAgent.get('/api/auth/me')).status, 401)

  const invalidSession = await request(app)
    .get('/api/auth/me')
    .set('Cookie', 'scopepay_session=invalid-session-token')
  assert.equal(invalidSession.status, 401)
  assert.ok(sessionCookie)
})

test('password reset is non-enumerating, expiring, single-use, and revokes sessions', async () => {
  const { database, state } = createDatabase()
  const sentEmails: { email: string; resetUrl: string }[] = []
  const app = express()
  app.use(express.json())
  app.use('/api/auth', createAuthRouter(database, {
    mailer: async (email, resetUrl) => { sentEmails.push({ email, resetUrl }) },
  }))
  app.use(errorHandler)
  const agent = request.agent(app)

  const registration = await withOrigin(agent.post('/api/auth/register'))
    .send({ name: 'Reset Owner', email: 'reset@example.com', password: 'secure-password-1' })
  const genericResponse = {
    message: 'If an account exists for that email, password reset instructions will be sent.',
  }

  const requested = await withOrigin(request(app).post('/api/auth/forgot-password'))
    .send({ email: 'reset@example.com' })
  assert.equal(requested.status, 202)
  assert.deepEqual(requested.body, genericResponse)
  assert.equal(sentEmails.length, 1)

  const unknown = await withOrigin(request(app).post('/api/auth/forgot-password'))
    .send({ email: 'not-registered@example.com' })
  assert.equal(unknown.status, 202)
  assert.deepEqual(unknown.body, genericResponse)
  assert.equal(sentEmails.length, 1)

  const resetToken = new URL(sentEmails[0]!.resetUrl).searchParams.get('token')
  assert.ok(resetToken)
  const reset = await withOrigin(request(app).post('/api/auth/reset-password'))
    .send({ token: resetToken, password: 'new-secure-password-3' })
  assert.equal(reset.status, 200)
  assert.equal((await agent.get('/api/auth/me')).status, 401)

  const reused = await withOrigin(request(app).post('/api/auth/reset-password'))
    .send({ token: resetToken, password: 'another-secure-password-4' })
  assert.equal(reused.status, 400)

  const oldPassword = await withOrigin(request(app).post('/api/auth/login'))
    .send({ email: 'reset@example.com', password: 'secure-password-1' })
  assert.equal(oldPassword.status, 401)
  const newPassword = await withOrigin(request(app).post('/api/auth/login'))
    .send({ email: 'reset@example.com', password: 'new-secure-password-3' })
  assert.equal(newPassword.status, 200)

  const invalidReset = await withOrigin(request(app).post('/api/auth/reset-password'))
    .send({ token: 'invalid-token-that-is-long-enough-to-validate', password: 'new-secure-password-5' })
  assert.equal(invalidReset.status, 400)
  const expiredRequest = await withOrigin(request(app).post('/api/auth/forgot-password'))
    .send({ email: 'reset@example.com' })
  assert.equal(expiredRequest.status, 202)
  const expiredToken = new URL(sentEmails[1]!.resetUrl).searchParams.get('token')
  const storedReset = state.resetTokens.find((item) => item.tokenHash === hashOpaqueToken(expiredToken ?? ''))
  assert.ok(storedReset)
  storedReset.expiresAt = new Date(Date.now() - 1000)
  const expired = await withOrigin(request(app).post('/api/auth/reset-password'))
    .send({ token: expiredToken, password: 'another-secure-password-6' })
  assert.equal(expired.status, 400)
  assert.ok(cookieValue(registration, 'scopepay_session'))
})

test('profile updates and password changes rotate the session safely', async () => {
  const { database } = createDatabase()
  const app = express()
  app.use(express.json())
  app.use('/api/auth', createAuthRouter(database))
  app.use(errorHandler)
  const agent = request.agent(app)

  const registration = await withOrigin(agent.post('/api/auth/register'))
    .send({ name: 'Profile Owner', email: 'profile@example.com', password: 'secure-password-1' })
  const csrfToken = cookieValue(registration, 'scopepay_csrf')
  const profile = await withOrigin(agent.patch('/api/auth/profile'))
    .set('X-CSRF-Token', csrfToken)
    .send({ name: 'Updated Owner', email: 'updated@example.com' })
  assert.equal(profile.status, 200)
  assert.equal(profile.body.user.name, 'Updated Owner')
  assert.equal(profile.body.user.email, 'updated@example.com')
  assert.equal('passwordHash' in profile.body.user, false)

  const password = await withOrigin(agent.patch('/api/auth/change-password'))
    .set('X-CSRF-Token', csrfToken)
    .send({ currentPassword: 'secure-password-1', newPassword: 'updated-secure-password-2' })
  assert.equal(password.status, 200)
  assert.equal((await agent.get('/api/auth/me')).status, 200)

  const oldPassword = await withOrigin(request(app).post('/api/auth/login'))
    .send({ email: 'updated@example.com', password: 'secure-password-1' })
  assert.equal(oldPassword.status, 401)
  const newPassword = await withOrigin(request(app).post('/api/auth/login'))
    .send({ email: 'updated@example.com', password: 'updated-secure-password-2' })
  assert.equal(newPassword.status, 200)
})

test('registration applies a per-IP rate limit', async () => {
  const { database } = createDatabase()
  const app = express()
  app.use(express.json())
  app.use('/api/auth', createAuthRouter(database))
  app.use(errorHandler)

  const attempts = await Promise.all(
    Array.from({ length: 6 }, () =>
      withOrigin(request(app).post('/api/auth/register')).send({}),
    ),
  )
  assert.deepEqual(attempts.map((response) => response.status), [400, 400, 400, 400, 400, 429])
})

test('a user cannot read another user’s project, change their milestone, or access/capture their payment', async () => {
  const { database, state } = createDatabase()
  const app = createApp(database)
  const ownerA = request.agent(app)
  const ownerB = request.agent(app)

  const registerA = await withOrigin(ownerA.post('/api/auth/register'))
    .send({ name: 'Owner A', email: 'owner-a@example.com', password: 'secure-password-a' })
  const csrfA = cookieValue(registerA, 'scopepay_csrf')
  const registerB = await withOrigin(ownerB.post('/api/auth/register'))
    .send({ name: 'Owner B', email: 'owner-b@example.com', password: 'secure-password-b' })
  const csrfB = cookieValue(registerB, 'scopepay_csrf')
  assert.equal((await request(app).get('/api/projects')).status, 401)

  const missingCsrf = await withOrigin(ownerA.post('/api/projects'))
    .send({
      title: 'Blocked project',
      clientName: 'Client',
      clientEmail: 'client@example.com',
      description: 'Request without CSRF',
      budget: 12000,
    })
  assert.equal(missingCsrf.status, 403)

  const projectAResponse = await withOrigin(ownerA.post('/api/projects'))
    .set('X-CSRF-Token', csrfA)
    .send({
      title: 'Owner A project',
      clientName: 'Client A',
      clientEmail: 'client-a@example.com',
      description: 'Private work for A',
      budget: 12000,
    })
  const projectBResponse = await withOrigin(ownerB.post('/api/projects'))
    .set('X-CSRF-Token', csrfB)
    .send({
      title: 'Owner B project',
      clientName: 'Client B',
      clientEmail: 'client-b@example.com',
      description: 'Private work for B',
      budget: 24000,
    })
  assert.equal(projectAResponse.status, 201)
  assert.equal(projectBResponse.status, 201)
  const projectAId = projectAResponse.body.id as string
  const projectBId = projectBResponse.body.id as string
  const userAId = registerA.body.user.id as string
  const userBId = registerB.body.user.id as string
  assert.equal(state.projects.find((project) => project.id === projectAId)?.ownerId, userAId)
  assert.equal(state.projects.find((project) => project.id === projectBId)?.ownerId, userBId)
  state.scopeChanges.push({
    id: 'scope-change-b',
    projectId: projectBId,
    originalRequirement: 'Initial scope',
    newRequirement: 'Private scope update',
    status: 'PENDING',
  })

  const milestoneBResponse = await withOrigin(ownerB.post(`/api/projects/${projectBId}/milestones`))
    .set('X-CSRF-Token', csrfB)
    .send({ title: 'B milestone', description: 'Private milestone', amount: 9000 })
  assert.equal(milestoneBResponse.status, 201)
  const milestoneBId = milestoneBResponse.body.id as string
  state.payments.push({
    id: 'payment-b',
    milestoneId: milestoneBId,
    paypalOrderId: 'ORDER-B',
    amount: 9000,
    currency: 'USD',
    status: 'PENDING',
  })

  assert.equal((await ownerA.get(`/api/projects/${projectBId}`)).status, 404)
  const foreignProjectUpdate = await withOrigin(ownerA.patch(`/api/projects/${projectBId}`))
    .set('X-CSRF-Token', csrfA)
    .send({ title: 'Taken over' })
  assert.equal(foreignProjectUpdate.status, 404)
  const projectsA = await ownerA.get('/api/projects')
  assert.equal(projectsA.body.some((project: { id: string }) => project.id === projectBId), false)
  assert.equal((await ownerA.get('/api/scope-changes')).body.some(
    (change: { id: string }) => change.id === 'scope-change-b',
  ), false)
  const foreignScopeChange = await withOrigin(ownerA.patch('/api/scope-changes/scope-change-b'))
    .set('X-CSRF-Token', csrfA)
    .send({ status: 'ACCEPTED' })
  assert.equal(foreignScopeChange.status, 404)

  const unauthorizedMilestoneUpdate = await withOrigin(ownerA.patch(`/api/milestones/${milestoneBId}`))
    .set('X-CSRF-Token', csrfA)
    .send({ amount: 1 })
  assert.equal(unauthorizedMilestoneUpdate.status, 404)
  assert.equal(state.milestones.find((item) => item.id === milestoneBId)?.amount, 9000)

  assert.equal((await ownerA.get('/api/payments/payment-b')).status, 404)
  const capture = await withOrigin(ownerA.post('/api/paypal/capture-order'))
    .set('X-CSRF-Token', csrfA)
    .send({ orderId: 'ORDER-B' })
  assert.equal(capture.status, 404)
  assert.equal(state.payments.find((item) => item.id === 'payment-b')?.status, 'PENDING')
})
