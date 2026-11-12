import { z } from 'zod'
import { env } from '../config/env.js'
import { HttpError } from '../middleware/errors.js'

export type OrderDetails = {
  id: string
  status: string
  purchase_units?: {
    reference_id?: string
    custom_id?: string
    amount?: { currency_code?: string; value?: string }
    payments?: {
      captures?: {
        id?: string
        status?: string
        amount?: { currency_code?: string; value?: string }
      }[]
    }
  }[]
}

export type PaypalGateway = {
  createOrder(input: {
    milestoneId: string
    paymentId: string
    amount: number
    currency: string
  }): Promise<string>
  captureOrder(orderId: string): Promise<OrderDetails>
}

const accessTokenSchema = z.object({
  access_token: z.string().min(1),
})

const orderSchema = z.object({
  id: z.string().min(1).max(128),
  status: z.string().min(1),
  purchase_units: z.array(z.object({
    reference_id: z.string().optional(),
    custom_id: z.string().optional(),
    amount: z.object({
      currency_code: z.string().optional(),
      value: z.string().optional(),
    }).optional(),
    payments: z.object({
      captures: z.array(z.object({
        id: z.string().optional(),
        status: z.string().optional(),
        amount: z.object({
          currency_code: z.string().optional(),
          value: z.string().optional(),
        }).optional(),
      })).optional(),
    }).optional(),
  })).optional(),
})

export class PaypalApiError extends HttpError {
  constructor(
    status: number,
    message: string,
    public readonly paymentFailed = false,
  ) {
    super(status, message)
    this.name = 'PaypalApiError'
  }
}

function timeoutSignal(milliseconds: number) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), milliseconds)
  timer.unref()
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timer),
  }
}

export function createPaypalClient(
  fetcher: typeof fetch = fetch,
  configuration = env,
): PaypalGateway {
  async function getAccessToken() {
    if (!configuration.PAYPAL_CLIENT_ID || !configuration.PAYPAL_CLIENT_SECRET) {
      throw new PaypalApiError(503, 'PayPal is not configured on the server')
    }

    let response: Response
    const timeout = timeoutSignal(15_000)
    try {
      response = await fetcher(`${configuration.PAYPAL_BASE_URL}/v1/oauth2/token`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(
            `${configuration.PAYPAL_CLIENT_ID}:${configuration.PAYPAL_CLIENT_SECRET}`,
          ).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials',
        signal: timeout.signal,
      })
    } catch {
      throw new PaypalApiError(502, 'Could not connect to PayPal')
    } finally {
      timeout.clear()
    }

    if (!response.ok) throw new PaypalApiError(502, 'PayPal authentication failed')

    const parsed = accessTokenSchema.safeParse(await response.json().catch(() => null))
    if (!parsed.success) throw new PaypalApiError(502, 'PayPal returned an invalid access token response')
    return parsed.data.access_token
  }

  async function requestOrder(path: string, token: string, init?: RequestInit) {
    let response: Response
    const timeout = timeoutSignal(20_000)
    try {
      response = await fetcher(`${configuration.PAYPAL_BASE_URL}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          ...init?.headers,
        },
        signal: timeout.signal,
      })
    } catch {
      throw new PaypalApiError(502, 'Could not complete the PayPal request')
    } finally {
      timeout.clear()
    }

    if (!response.ok) {
      throw new PaypalApiError(
        502,
        response.status === 422
          ? 'PayPal could not complete this order'
          : 'PayPal order request failed',
        path.endsWith('/capture') && response.status === 422,
      )
    }

    const parsed = orderSchema.safeParse(await response.json().catch(() => null))
    if (!parsed.success) throw new PaypalApiError(502, 'PayPal returned an invalid order response')
    return parsed.data
  }

  return {
    async createOrder({ milestoneId, paymentId, amount, currency }) {
      const token = await getAccessToken()
      const order = await requestOrder('/v2/checkout/orders', token, {
        method: 'POST',
        headers: { 'PayPal-Request-Id': `${paymentId}-create` },
        body: JSON.stringify({
          intent: 'CAPTURE',
          purchase_units: [{
            reference_id: milestoneId,
            custom_id: paymentId,
            amount: {
              currency_code: currency,
              value: (amount / 100).toFixed(2),
            },
          }],
        }),
      })
      const unit = order.purchase_units?.[0]
      if (
        order.status !== 'CREATED' ||
        order.purchase_units?.length !== 1 ||
        unit?.reference_id !== milestoneId ||
        unit.custom_id !== paymentId ||
        unit.amount?.currency_code !== currency ||
        unit.amount.value !== (amount / 100).toFixed(2)
      ) {
        throw new PaypalApiError(502, 'PayPal did not create an order')
      }
      return order.id
    },

    async captureOrder(orderId) {
      const token = await getAccessToken()
      return requestOrder(
        `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`,
        token,
        {
          method: 'POST',
          headers: { 'PayPal-Request-Id': `${orderId}-capture` },
          body: '{}',
        },
      )
    },
  }
}
