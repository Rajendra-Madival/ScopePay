import 'dotenv/config'
import { z } from 'zod'

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  FRONTEND_ORIGIN: z.string().url().default('http://localhost:5173'),
  PAYPAL_CLIENT_ID: z.string().trim().default(''),
  PAYPAL_CLIENT_SECRET: z.string().default(''),
  PAYPAL_BASE_URL: z.enum([
    'https://api-m.sandbox.paypal.com',
    'https://api-m.paypal.com',
  ]).default('https://api-m.sandbox.paypal.com'),
  PAYPAL_CURRENCY: z.literal('USD').default('USD'),
  OPENAI_API_KEY: z.string().trim().default(''),
  OPENAI_MODEL: z.string().trim().default('gpt-4.1-mini'),
  GEMINI_API_KEY: z.string().trim().default(''),
  GEMINI_MODEL: z.string().trim().default('gemini-3.6-flash'),
  SMTP_HOST: z.string().trim().default(''),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_USER: z.string().default(''),
  SMTP_PASSWORD: z.string().default(''),
  SMTP_FROM: z.string().trim().default(''),
}).superRefine((config, context) => {
  const smtpValues = [config.SMTP_HOST, config.SMTP_USER, config.SMTP_PASSWORD, config.SMTP_FROM]
  if (smtpValues.some(Boolean) && smtpValues.some((value) => !value)) {
    context.addIssue({
      code: 'custom',
      message: 'SMTP_HOST, SMTP_USER, SMTP_PASSWORD and SMTP_FROM must be configured together',
      path: ['SMTP_HOST'],
    })
  }
  if (config.NODE_ENV === 'production' && !config.FRONTEND_ORIGIN.startsWith('https://')) {
    context.addIssue({
      code: 'custom',
      message: 'FRONTEND_ORIGIN must use HTTPS in production',
      path: ['FRONTEND_ORIGIN'],
    })
  }
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('; ')
  throw new Error(`Invalid backend environment configuration: ${details}`)
}

export const env = parsed.data
