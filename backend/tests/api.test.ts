import assert from 'node:assert/strict'
import { before, test } from 'node:test'
import express from 'express'
import request from 'supertest'

process.env.DATABASE_URL ??= 'postgresql://test:test@127.0.0.1:5432/scopepay_test'
process.env.PAYPAL_CLIENT_ID ??= ''
process.env.PAYPAL_CLIENT_SECRET ??= ''

const { createPaypalRouter } = await import('../src/routes/paypal.js')
const { errorHandler } = await import('../src/middleware/errors.js')
const { createPaypalClient, PaypalApiError } = await import('../src/services/paypalClient.js')
const { env } = await import('../src/config/env.js')

before(() => {
  assert.equal(env.PAYPAL_CURRENCY, 'USD')
})

const completedOrder = {
  id: 'ORDER-1',
  status: 'COMPLETED',
  purchase_units: [{
    reference_id: 'milestone-1',
    custom_id: 'payment-1',
    amount: { currency_code: 'USD', value: '25.00' },
    payments: {
      captures: [{
        id: 'CAPTURE-1',
        status: 'COMPLETED',
        amount: { currency_code: 'USD', value: '25.00' },
      }],
    },
  }],
}

function createHarness({
  captureResponse = completedOrder,
  captureError,
}: {
  captureResponse?: typeof completedOrder
  captureError?: Error
} = {}) {
  let paymentStatus: 'CREATING' | 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' = 'PENDING'
  let milestoneStatus: 'PENDING' | 'PAID' = 'PENDING'
  let currentOrderId = 'ORDER-1'
  const createdOrders: { milestoneId: string; paymentId: string; amount: number; currency: string }[] = []
  let captureCalls = 0

  const repository = {
    getMilestone: async (id: string) =>
      id === 'milestone-1'
        ? { id, amount: 2500, status: milestoneStatus, currency: 'USD' }
        : null,
    reservePayment: async (milestoneId: string, amount: number, currency: string) => {
      if (paymentStatus === 'PENDING' && currentOrderId) {
        return { kind: 'existing' as const, orderId: currentOrderId }
      }
      paymentStatus = 'CREATING'
      return { kind: 'created' as const, paymentId: 'payment-1' }
    },
    saveOrder: async (_paymentId: string, orderId: string) => {
      currentOrderId = orderId
      paymentStatus = 'PENDING'
    },
    deleteReservation: async () => {
      paymentStatus = 'FAILED'
    },
    getPaymentForCapture: async (orderId: string) =>
      orderId === currentOrderId
        ? {
            id: 'payment-1',
            milestoneId: 'milestone-1',
            amount: 2500,
            currency: 'USD',
            status: paymentStatus,
            milestone: {
              id: 'milestone-1',
              amount: 2500,
              status: milestoneStatus,
              project: { currency: 'USD' },
            },
          }
        : null,
    claimPayment: async () => {
      if (paymentStatus !== 'PENDING') return false
      paymentStatus = 'PROCESSING'
      return true
    },
    releasePayment: async (_paymentId: string, failed = false) => {
      paymentStatus = failed ? 'FAILED' : 'PENDING'
    },
    cancelPayment: async (orderId: string) => {
      if (orderId !== currentOrderId || paymentStatus !== 'PENDING') return false
      paymentStatus = 'CANCELLED'
      return true
    },
    completePayment: async () => {
      paymentStatus = 'COMPLETED'
      milestoneStatus = 'PAID'
    },
  }

  const paypal = {
    createOrder: async (input: (typeof createdOrders)[number]) => {
      createdOrders.push(input)
      currentOrderId = 'ORDER-CREATED'
      return currentOrderId
    },
    captureOrder: async () => {
      captureCalls += 1
      if (captureError) throw captureError
      return captureResponse
    },
  }

  const app = express()
  app.use(express.json())
  app.use('/api/paypal', createPaypalRouter(repository, paypal))
  app.use(errorHandler)

  return {
    app,
    repository,
    createdOrders,
    getCaptureCalls: () => captureCalls,
    getPaymentStatus: () => paymentStatus,
    getMilestoneStatus: () => milestoneStatus,
    setPaymentStatus: (status: typeof paymentStatus) => { paymentStatus = status },
  }
}

test('create-order rejects client-supplied amount manipulation', async () => {
  const harness = createHarness()
  const response = await request(harness.app)
    .post('/api/paypal/create-order')
    .send({ milestoneId: 'milestone-1', amount: 1 })

  assert.equal(response.status, 400)
  assert.equal(harness.createdOrders.length, 0)
})

test('create-order returns not found for an unknown milestone', async () => {
  const harness = createHarness()
  const response = await request(harness.app)
    .post('/api/paypal/create-order')
    .send({ milestoneId: 'missing' })

  assert.equal(response.status, 404)
})

test('capture-order rejects extra client-supplied amount fields', async () => {
  const harness = createHarness()
  const response = await request(harness.app)
    .post('/api/paypal/capture-order')
    .send({ orderId: 'ORDER-1', amount: 1 })

  assert.equal(response.status, 400)
  assert.equal(harness.getCaptureCalls(), 0)
})

test('create-order uses the stored milestone amount and currency', async () => {
  const harness = createHarness()
  harness.setPaymentStatus('FAILED')

  const response = await request(harness.app)
    .post('/api/paypal/create-order')
    .send({ milestoneId: 'milestone-1' })

  assert.equal(response.status, 201)
  assert.equal(response.body.orderId, 'ORDER-CREATED')
  assert.deepEqual(harness.createdOrders[0], {
    milestoneId: 'milestone-1',
    paymentId: 'payment-1',
    amount: 2500,
    currency: 'USD',
  })
})

test('create-order reuses a pending order instead of creating duplicates', async () => {
  const harness = createHarness()
  const response = await request(harness.app)
    .post('/api/paypal/create-order')
    .send({ milestoneId: 'milestone-1' })

  assert.equal(response.status, 200)
  assert.equal(response.body.orderId, 'ORDER-1')
  assert.equal(harness.createdOrders.length, 0)
})

test('capture-order verifies PayPal capture before marking a milestone paid', async () => {
  const harness = createHarness()
  const response = await request(harness.app)
    .post('/api/paypal/capture-order')
    .send({ orderId: 'ORDER-1' })

  assert.equal(response.status, 200)
  assert.equal(response.body.status, 'COMPLETED')
  assert.equal(harness.getPaymentStatus(), 'COMPLETED')
  assert.equal(harness.getMilestoneStatus(), 'PAID')
})

test('capture-order rejects duplicate capture attempts', async () => {
  const harness = createHarness()
  await request(harness.app).post('/api/paypal/capture-order').send({ orderId: 'ORDER-1' }).expect(200)
  const duplicate = await request(harness.app).post('/api/paypal/capture-order').send({ orderId: 'ORDER-1' })

  assert.equal(duplicate.status, 409)
  assert.equal(harness.getCaptureCalls(), 1)
})

test('capture-order rejects mismatched capture amount and does not mark paid', async () => {
  const mismatchedOrder = {
    ...completedOrder,
    purchase_units: [{
      ...completedOrder.purchase_units[0],
      amount: { currency_code: 'USD', value: '1.00' },
      payments: {
        captures: [{
          id: 'CAPTURE-1',
          status: 'COMPLETED',
          amount: { currency_code: 'USD', value: '1.00' },
        }],
      },
    }],
  }
  const harness = createHarness({ captureResponse: mismatchedOrder })
  const response = await request(harness.app)
    .post('/api/paypal/capture-order')
    .send({ orderId: 'ORDER-1' })

  assert.equal(response.status, 502)
  assert.equal(harness.getPaymentStatus(), 'FAILED')
  assert.equal(harness.getMilestoneStatus(), 'PENDING')
})

test('capture-order leaves milestone unpaid when PayPal capture fails', async () => {
  const harness = createHarness({
    captureError: new PaypalApiError(502, 'PayPal unavailable', true),
  })
  const response = await request(harness.app)
    .post('/api/paypal/capture-order')
    .send({ orderId: 'ORDER-1' })

  assert.equal(response.status, 502)
  assert.equal(harness.getPaymentStatus(), 'FAILED')
  assert.equal(harness.getMilestoneStatus(), 'PENDING')
})

test('cancel-order marks checkout cancelled without changing milestone payment status', async () => {
  const harness = createHarness()
  const response = await request(harness.app)
    .post('/api/paypal/cancel-order')
    .send({ orderId: 'ORDER-1' })

  assert.equal(response.status, 204)
  assert.equal(harness.getPaymentStatus(), 'CANCELLED')
  assert.equal(harness.getMilestoneStatus(), 'PENDING')
})

test('PayPal client obtains OAuth token and creates a server-priced Orders v2 order', async () => {
  const requests: { url: string; init?: RequestInit }[] = []
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input)
    requests.push({ url, init })
    if (url.endsWith('/v1/oauth2/token')) {
      return Response.json({ access_token: 'test-access-token' })
    }
    return Response.json({
      id: 'ORDER-CREATED',
      status: 'CREATED',
      purchase_units: [{
        reference_id: 'milestone-1',
        custom_id: 'payment-1',
        amount: { currency_code: 'USD', value: '25.00' },
      }],
    })
  }

  const paypal = createPaypalClient(fetcher, {
    ...env,
    PAYPAL_CLIENT_ID: 'test-client-id',
    PAYPAL_CLIENT_SECRET: 'test-client-secret',
    PAYPAL_BASE_URL: 'https://api-m.sandbox.paypal.com',
  })
  const orderId = await paypal.createOrder({
    milestoneId: 'milestone-1',
    paymentId: 'payment-1',
    amount: 2500,
    currency: 'USD',
  })

  assert.equal(orderId, 'ORDER-CREATED')
  assert.equal(requests.length, 2)
  assert.equal(requests[0]?.url, 'https://api-m.sandbox.paypal.com/v1/oauth2/token')
  assert.equal(requests[1]?.url, 'https://api-m.sandbox.paypal.com/v2/checkout/orders')
  assert.deepEqual(JSON.parse(String(requests[1]?.init?.body)), {
    intent: 'CAPTURE',
    purchase_units: [{
      reference_id: 'milestone-1',
      custom_id: 'payment-1',
      amount: { currency_code: 'USD', value: '25.00' },
    }],
  })
})
