import { z } from 'zod'
import {
  approvedPlanMilestoneSchema,
  projectCurrencySchema,
  projectPlanDetailsSchema,
} from './projectPlan.js'

const title = z.string().trim().min(1).max(120)
const description = z.string().trim().max(5000)
const projectDescription = z.string().trim().min(1).max(10_000)
const cents = z.number().int().min(1).max(2_147_483_647)
const currency = z.string().regex(/^[A-Z]{3}$/)
const date = z.iso.date()

export const idParamsSchema = z.object({ id: z.string().min(1).max(64) })
export const projectParamsSchema = z.object({ projectId: z.string().min(1).max(64) })
export const paymentQuerySchema = z.object({
  milestoneId: z.string().min(1).max(64).optional(),
  projectId: z.string().min(1).max(64).optional(),
}).strict()

const projectFieldsSchema = z.object({
  title,
  clientName: z.string().trim().min(1).max(120).nullable().optional(),
  clientEmail: z.email().max(254).nullable().optional(),
  description: projectDescription,
  budget: cents,
  currency: currency.default('USD'),
  deadline: z.string().trim().min(1).max(120).optional(),
  plan: projectPlanDetailsSchema.optional(),
  milestones: z.array(approvedPlanMilestoneSchema).min(1).max(20).optional(),
}).strict()

export const createProjectSchema = projectFieldsSchema.superRefine((project, context) => {
  if ((project.plan === undefined) !== (project.milestones === undefined)) {
    context.addIssue({
      code: 'custom',
      message: 'An approved plan and its milestones must be provided together',
      path: ['plan'],
    })
  }
  if (project.plan && !projectCurrencySchema.safeParse(project.currency).success) {
    context.addIssue({
      code: 'custom',
      message: 'AI project plans require a supported currency',
      path: ['currency'],
    })
  }
  if (project.milestones) {
    const milestoneTotal = project.milestones.reduce((total, milestone) => total + milestone.amount, 0)
    if (milestoneTotal !== project.budget) {
      context.addIssue({
        code: 'custom',
        message: 'Milestone amounts must add up to the project budget',
        path: ['milestones'],
      })
    }
    if (
      project.plan &&
      project.milestones.reduce((total, milestone) => total + milestone.estimatedDays, 0) !==
        project.plan.estimatedDurationDays
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Project duration must equal the sum of milestone durations',
        path: ['plan', 'estimatedDurationDays'],
      })
    }
  }
})

export const updateProjectSchema = projectFieldsSchema
  .omit({ plan: true, milestones: true })
  .partial()
  .strict()

export const createMilestoneSchema = z.object({
  title,
  description: description.default(''),
  amount: cents,
  dueDate: date.nullable().optional(),
}).strict()

export const scopeChangeStatusSchema = z.enum(['PENDING', 'REVIEWED', 'ACCEPTED', 'REJECTED'])

export const createScopeChangeSchema = z.object({
  originalRequirement: description.min(1).max(5000),
  newRequirement: description.min(1).max(5000),
  aiAnalysis: z.record(z.string(), z.any()).nullable().optional(),
  status: scopeChangeStatusSchema.default('PENDING'),
}).strict()

export const updateScopeChangeSchema = createScopeChangeSchema
  .partial()
  .strict()

export const analyzeScopeChangeSchema = z.object({
  originalRequirement: description.min(1).max(5000),
  newRequirement: description.min(1).max(5000),
}).strict()

export const updateMilestoneSchema = createMilestoneSchema
  .omit({ dueDate: true })
  .partial()
  .extend({ dueDate: date.nullable().optional() })
  .strict()
