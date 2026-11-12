import { z } from 'zod'

export const projectCurrencies = ['USD', 'EUR', 'GBP', 'CAD', 'AUD'] as const
export const projectCurrencySchema = z.enum(projectCurrencies)
export type ProjectCurrency = z.infer<typeof projectCurrencySchema>

const planText = z.string().trim().min(1).max(500)
const moneyLimit = 21_474_836.47

export const analyzeProjectInputSchema = z.object({
  description: z.string().trim().min(1).max(10_000),
  budget: z.number().finite().positive().max(moneyLimit).optional(),
  currency: projectCurrencySchema.optional(),
  deadline: z.string().trim().min(1).max(120).optional(),
}).strict()

export const generatedPlanMilestoneSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(2000),
  deliverables: z.array(planText).min(1).max(10),
  estimatedDays: z.number().int().min(1).max(3650),
  suggestedAmount: z.number().finite().positive().max(moneyLimit),
}).strict()

export const generatedProjectPlanSchema = z.object({
  projectTitle: z.string().trim().min(1).max(120),
  clientName: z.string().trim().max(120),
  clientEmail: z.string().trim().max(254).refine(
    (value) => value === '' || z.email().safeParse(value).success,
    'Client email must be valid when provided',
  ),
  summary: z.string().trim().min(1).max(3000),
  requirements: z.array(planText).min(1).max(20),
  assumptions: z.array(planText).max(20),
  milestones: z.array(generatedPlanMilestoneSchema).min(1).max(20),
  risks: z.array(planText).max(20),
  missingInformation: z.array(planText).max(20),
  clientQuestions: z.array(planText).max(20),
  currency: projectCurrencySchema,
  deadline: z.string().trim().max(120),
  totalEstimatedAmount: z.number().finite().positive().max(moneyLimit),
  estimatedDurationDays: z.number().int().min(1).max(3650),
}).strict()

export const projectPlanDetailsSchema = z.object({
  summary: z.string().trim().min(1).max(3000),
  requirements: z.array(planText).min(1).max(20),
  assumptions: z.array(planText).max(20),
  risks: z.array(planText).max(20),
  missingInformation: z.array(planText).max(20),
  clientQuestions: z.array(planText).max(20),
  estimatedDurationDays: z.number().int().min(1).max(3650),
}).strict()

export const approvedPlanMilestoneSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(2000),
  deliverables: z.array(planText).min(1).max(10),
  estimatedDays: z.number().int().min(1).max(3650),
  amount: z.number().int().min(1).max(2_147_483_647),
}).strict()

export type AnalyzeProjectInput = z.infer<typeof analyzeProjectInputSchema>
export type GeneratedProjectPlan = z.infer<typeof generatedProjectPlanSchema>
export type ProjectPlanDetails = z.infer<typeof projectPlanDetailsSchema>

export function toMinorUnits(amount: number) {
  const scaled = amount * 100
  const rounded = Math.round(scaled)
  if (!Number.isSafeInteger(rounded) || Math.abs(scaled - rounded) > 0.00001) {
    throw new Error('Currency amount must have no more than two decimal places')
  }
  return rounded
}

export function fromMinorUnits(amount: number) {
  return Number((amount / 100).toFixed(2))
}
