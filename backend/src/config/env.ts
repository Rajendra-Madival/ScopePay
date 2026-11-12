import 'dotenv/config'
import { z } from 'zod'

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  FRONTEND_ORIGIN: z.string().url().default('http://localhost:5173'),
  PAYPAL_CLIENT_ID: z.string().trim().default(''),
  PAYPAL_CLIENT_SECRET: z.string().default(''),
  PAYPAL_BASE_URL: z.enum([
    'https://api-m.sandbox.paypal.com',
    'https://api-m.paypal.com',
  ]).default('https://api-m.sandbox.paypal.com'),
  PAYPAL_CURRENCY: z.literal('USD').default('USD'),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('; ')
  throw new Error(`Invalid backend environment configuration: ${details}`)
}

export const env = parsed.data
