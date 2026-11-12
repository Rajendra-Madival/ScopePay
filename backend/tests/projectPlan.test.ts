import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'
import request from 'supertest'

process.env.DATABASE_URL ??= 'postgresql://test:test@127.0.0.1:5432/scopepay_test'
process.env.GEMINI_API_KEY ??= ''

const { createAiRouter } = await import('../src/routes/ai.js')
const { createProjectsRouter } = await import('../src/routes/projects.js')
const { errorHandler, HttpError } = await import('../src/middleware/errors.js')
const { createGeminiProjectPlanner } = await import('../src/services/geminiProjectPlanner.js')

function makePlan(total: number, title: string, overrides: Partial<{
  clientName: string
  clientEmail: string
  currency: 'USD' | 'EUR' | 'GBP' | 'CAD' | 'AUD'
  deadline: string
}> = {}) {
  const firstAmount = Math.round(total * 60) / 100
  const secondAmount = Number((total - firstAmount).toFixed(2))
  return {
    projectTitle: title,
    clientName: '',
    clientEmail: '',
    summary: `Plan for ${title}`,
    requirements: ['Deliver the requested solution'],
    assumptions: ['Client provides timely feedback'],
    milestones: [
      {
        title: 'Discovery and design',
        description: 'Confirm requirements and prepare the design.',
        deliverables: ['Approved design'],
        estimatedDays: 4,
        suggestedAmount: firstAmount,
      },
      {
        title: 'Implementation and handoff',
        description: 'Build, test, and hand over the solution.',
        deliverables: ['Tested deliverable', 'Handoff notes'],
        estimatedDays: 6,
        suggestedAmount: secondAmount,
      },
    ],
    risks: ['Feedback delays may affect schedule'],
    missingInformation: [],
    clientQuestions: ['Who will approve the final delivery?'],
    currency: 'USD',
    deadline: '',
    totalEstimatedAmount: total,
    estimatedDurationDays: 10,
    ...overrides,
  }
}

function createAuthenticatedApp() {
  const app = express()
  app.use(express.json())
  app.use((request, _response, next) => {
    request.user = { id: 'test-owner', name: 'Test Owner', email: 'test@example.com' }
    next()
  })
  return app
}

test('planner returns validated structured plans for three distinct project descriptions', async () => {
  const inputs = [
    { description: 'Build a responsive marketing website with a contact form and CMS.', budget: 1200, currency: 'USD', deadline: '30 days' },
    { description: 'Create a mobile appointment booking app with calendar and notifications.', budget: 2500, currency: 'EUR', deadline: '8 weeks' },
    { description: 'Design a brand identity and prepare social media launch assets.', budget: 875.5, currency: 'CAD', deadline: 'by October' },
  ]
  const receivedDescriptions: string[] = []
  const planner = createGeminiProjectPlanner(async (input, budgetMinorUnits) => {
    receivedDescriptions.push(input.description)
    return JSON.stringify(makePlan(
      budgetMinorUnits! / 100,
      `Plan ${receivedDescriptions.length}`,
      { currency: input.currency, deadline: input.deadline },
    ))
  }, { apiKey: '', model: 'test-model' })

  const plans = await Promise.all(inputs.map((input) => planner(input)))
  assert.deepEqual(receivedDescriptions, inputs.map((input) => input.description))
  assert.equal(plans.length, 3)
  for (const [index, plan] of plans.entries()) {
    const expectedMinor = Math.round(inputs[index]!.budget * 100)
    assert.equal(plan.totalEstimatedAmount, expectedMinor / 100)
    assert.equal(
      plan.milestones.reduce((sum, milestone) => sum + Math.round(milestone.suggestedAmount * 100), 0),
      expectedMinor,
    )
    assert.equal(plan.estimatedDurationDays, 10)
    assert.ok(plan.milestones.every((milestone) => milestone.suggestedAmount > 0))
  }
})

test('planner retries a mismatched budget once and rejects a second mismatch', async () => {
  let calls = 0
  const planner = createGeminiProjectPlanner(async (_input, budgetMinorUnits, correction) => {
    calls += 1
    const plan = correction
      ? makePlan(budgetMinorUnits / 100, 'Corrected plan')
      : makePlan(budgetMinorUnits / 100 - 1, 'Mismatched plan')
    return JSON.stringify(plan)
  }, { apiKey: '', model: 'test-model' })

  const result = await planner({
    description: 'Create a new ecommerce store with product catalog and checkout.',
    budget: 1000,
    currency: 'USD',
    deadline: '45 days',
  })
  assert.equal(calls, 2)
  assert.equal(result.totalEstimatedAmount, 1000)

  const invalidPlanner = createGeminiProjectPlanner(async (_input, budgetMinorUnits) =>
    JSON.stringify(makePlan(budgetMinorUnits / 100 - 1, 'Still mismatched')),
  { apiKey: '', model: 'test-model' })
  await assert.rejects(
    invalidPlanner({
      description: 'Create a new ecommerce store with product catalog and checkout.',
      budget: 1000,
      currency: 'USD',
      deadline: '45 days',
    }),
    (error: unknown) => error instanceof HttpError && error.status === 422,
  )
})

test('planner rejects malformed responses and explicitly reports missing server credentials', async () => {
  const malformedPlanner = createGeminiProjectPlanner(async () => 'not-json', {
    apiKey: '',
    model: 'test-model',
  })
  await assert.rejects(
    malformedPlanner({
      description: 'Create a new ecommerce store with product catalog and checkout.',
      budget: 1000,
      currency: 'USD',
      deadline: '45 days',
    }),
    (error: unknown) => error instanceof HttpError && error.status === 502,
  )

  const unconfiguredPlanner = createGeminiProjectPlanner(undefined, {
    apiKey: '',
    model: 'test-model',
  })
  await assert.rejects(
    unconfiguredPlanner({
      description: 'Create a new ecommerce store with product catalog and checkout.',
      budget: 1000,
      currency: 'USD',
      deadline: '45 days',
    }),
    (error: unknown) => error instanceof HttpError && error.status === 503,
  )
})

test('planner reports provider availability errors without mislabeling them as generation failures', async () => {
  const unavailablePlanner = createGeminiProjectPlanner(async () => {
    throw { status: 503 }
  }, { apiKey: 'configured-for-test', model: 'test-model' })

  await assert.rejects(
    unavailablePlanner({
      description: 'Build a website with clear service pages and a contact form.',
      budget: 1000,
      currency: 'USD',
      deadline: '30 days',
    }),
    (error: unknown) => error instanceof HttpError &&
      error.status === 503 &&
      error.message === 'Gemini is temporarily unavailable. Please try again later.',
  )
})

test('AI analysis route limits requests per authenticated user', async () => {
  let planCalls = 0
  const planner = createGeminiProjectPlanner(async (input, budgetMinorUnits) => {
    planCalls += 1
    return JSON.stringify(makePlan(budgetMinorUnits / 100, input.description.slice(0, 40)))
  }, { apiKey: '', model: 'test-model' })
  const app = createAuthenticatedApp()
  app.use('/api/ai', createAiRouter(planner))
  app.use(errorHandler)

  const input = {
    description: 'Create an online learning platform with course and progress features.',
    budget: 1000,
    currency: 'USD',
    deadline: '60 days',
  }
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await request(app).post('/api/ai/analyze-project').send(input).expect(200)
  }
  const limited = await request(app).post('/api/ai/analyze-project').send(input)
  assert.equal(limited.status, 429)
  assert.ok(Number(limited.headers['retry-after']) > 0)
  assert.equal(planCalls, 5)
})

test('AI analysis requires a nonempty brief and accepts concise descriptions', async () => {
  let planCalls = 0
  const planner = createGeminiProjectPlanner(async (input, budgetMinorUnits) => {
    planCalls += 1
    return JSON.stringify(makePlan(
      budgetMinorUnits === undefined ? 1250 : budgetMinorUnits / 100,
      input.description,
      { currency: input.currency ?? 'USD', deadline: input.deadline ?? '' },
    ))
  }, { apiKey: '', model: 'test-model' })
  const app = createAuthenticatedApp()
  app.use('/api/ai', createAiRouter(planner))
  app.use(errorHandler)

  const responseDescriptionOnly = await request(app)
    .post('/api/ai/analyze-project')
    .send({ description: 'Build a responsive bakery website with an online menu.' })
  const responseWithEmptyDescription = await request(app)
    .post('/api/ai/analyze-project')
    .send({ description: '  ', budget: 1000, currency: 'USD', deadline: '30 days' })
  const responseWithShortDescription = await request(app)
    .post('/api/ai/analyze-project')
    .send({ description: 'Website', budget: 1000, currency: 'USD', deadline: '30 days' })
  assert.equal(responseDescriptionOnly.status, 200)
  assert.equal(responseDescriptionOnly.body.totalEstimatedAmount, 1250)
  assert.equal(responseDescriptionOnly.body.currency, 'USD')
  assert.equal(responseDescriptionOnly.body.deadline, '')
  assert.equal(responseWithEmptyDescription.status, 400)
  assert.equal(responseWithShortDescription.status, 200)
  assert.equal(planCalls, 2)
})

test('planner retries Gemini once after a temporary outage', async () => {
  let calls = 0
  const planner = createGeminiProjectPlanner(async (input, budgetMinorUnits) => {
    calls += 1
    if (calls === 1) throw { status: 503 }
    return JSON.stringify(makePlan(
      budgetMinorUnits === undefined ? 900 : budgetMinorUnits / 100,
      'Recovered plan',
      { currency: input.currency ?? 'USD', deadline: input.deadline ?? '' },
    ))
  }, { apiKey: 'configured-for-test', model: 'test-model' })

  const plan = await planner({ description: 'Create a landing page for a local studio.' })
  assert.equal(calls, 2)
  assert.equal(plan.totalEstimatedAmount, 900)
  assert.equal(plan.currency, 'USD')
})

test('approved project and milestone records are persisted together under the authenticated owner', async () => {
  const savedProjects: Record<string, unknown>[] = []
  const savedMilestones: Record<string, unknown>[] = []
  let transactionCalls = 0
  const transaction = {
    project: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        savedProjects.push(data)
        return { id: 'project-1', ...data, createdAt: new Date().toISOString() }
      },
    },
    milestone: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        savedMilestones.push(data)
        return { id: `milestone-${savedMilestones.length}`, ...data, status: 'PENDING' }
      },
    },
  }
  const database = {
    $transaction: async <T>(callback: (database: typeof transaction) => Promise<T>) => {
      transactionCalls += 1
      return callback(transaction)
    },
  }
  const app = createAuthenticatedApp()
  app.use('/api/projects', createProjectsRouter(database as never))
  app.use(errorHandler)

  const input = {
    title: 'Website refresh',
    clientName: null,
    clientEmail: null,
    description: 'A responsive company website with a contact form.',
    budget: 100000,
    currency: 'USD',
    deadline: '30 days',
    plan: {
      summary: 'Plan for a responsive company website.',
      requirements: ['Responsive website', 'Contact form'],
      assumptions: [],
      risks: [],
      missingInformation: [],
      clientQuestions: [],
      estimatedDurationDays: 10,
    },
    milestones: makePlan(1000, 'Website refresh').milestones.map(({ suggestedAmount, ...milestone }) => ({
      ...milestone,
      amount: Math.round(suggestedAmount * 100),
    })),
  }
  const response = await request(app).post('/api/projects').send(input)
  assert.equal(response.status, 201, JSON.stringify(response.body))
  assert.equal(transactionCalls, 1)
  assert.equal(savedProjects[0]?.ownerId, 'test-owner')
  assert.equal(savedProjects[0]?.clientName, null)
  assert.equal(savedProjects[0]?.clientEmail, null)
  assert.equal(savedProjects[0]?.deadline, '30 days')
  assert.equal(savedMilestones.length, 2)
  assert.ok(savedMilestones.every((milestone) => milestone.projectId === 'project-1'))
  assert.equal(response.body.milestones.length, 2)

  await request(app).post('/api/projects').send({ ...input, ownerId: 'another-user' }).expect(400)
  assert.equal(transactionCalls, 1)
})
