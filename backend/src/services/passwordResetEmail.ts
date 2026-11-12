import nodemailer from 'nodemailer'
import { env } from '../config/env.js'

export type PasswordResetMailer = (email: string, resetUrl: string) => Promise<void>

export function createPasswordResetMailer(): PasswordResetMailer | null {
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASSWORD || !env.SMTP_FROM) return null

  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    requireTLS: env.SMTP_PORT !== 465,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASSWORD,
    },
  })

  return async (email, resetUrl) => {
    await transport.sendMail({
      from: env.SMTP_FROM,
      to: email,
      subject: 'Reset your ScopePay password',
      text: `Use this one-time link to reset your ScopePay password. It expires in 30 minutes:\n\n${resetUrl}\n\nIf you did not request this, you can ignore this email.`,
      html: `<p>Use this one-time link to reset your ScopePay password. It expires in 30 minutes:</p><p><a href="${resetUrl}">Reset password</a></p><p>If you did not request this, you can ignore this email.</p>`,
    })
  }
}
