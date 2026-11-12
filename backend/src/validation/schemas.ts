import { z } from 'zod'

const title = z.string().trim().min(1).max(120)
const description = z.string().trim().max(5000)
const cents = z.number().int().min(1).max(2_147_483_647)
const currency = z.string().regex(/^[A-Z]{3}$/)
const date = z.iso.date()

export const idParamsSchema = z.object({ id: z.string().min(1).max(64) })
export const projectParamsSchema = z.object({ projectId: z.string().min(1).max(64) })
export const paymentQuerySchema = z.object({
  milestoneId: z.string().min(1).max(64).optional(),
  projectId: z.string().min(1).max(64).optional(),
}).strict()

export const createProjectSchema = z.object({
  title,
  clientName: z.string().trim().min(1).max(120),
  clientEmail: z.email().max(254),
  description: description.min(1),
  budget: cents,
  currency: currency.default('USD'),
}).strict()

export const updateProjectSchema = createProjectSchema.partial().strict()

export const createMilestoneSchema = z.object({
  title,
  description: description.default(''),
  amount: cents,
  dueDate: date.nullable().optional(),
}).strict()

export const updateMilestoneSchema = createMilestoneSchema
  .omit({ dueDate: true })
  .partial()
  .extend({ dueDate: date.nullable().optional() })
  .strict()
