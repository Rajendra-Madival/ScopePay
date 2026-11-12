import type {
  Milestone,
  MilestoneDraft,
  Project,
  ProjectDraft,
  ProjectPlanDetails,
  ScopeAnalysis,
  ScopeChange,
  ScopeChangeDraft,
  User,
} from '../types'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000'

type ApiMilestone = {
  id: string
  projectId: string
  title: string
  description: string
  amount: number
  status: 'PENDING' | 'PAID'
  dueDate: string | null
  deliverables: unknown
  estimatedDays: number | null
  createdAt: string
}

export type GeneratedProjectPlan = {
  projectTitle: string
  summary: string
  requirements: string[]
  assumptions: string[]
  milestones: {
    title: string
    description: string
    deliverables: string[]
    estimatedDays: number
    suggestedAmount: number
  }[]
  risks: string[]
  missingInformation: string[]
  clientQuestions: string[]
  totalEstimatedAmount: number
  estimatedDurationDays: number
}

function readCsrfCookie() {
  if (typeof document === 'undefined') return ''
  const csrfCookie = document.cookie
    .split(';')
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith('scopepay_csrf='))
  return csrfCookie ? csrfCookie.slice('scopepay_csrf='.length) : ''
}

type ApiProject = {
  id: string
  title: string
  clientName: string
  clientEmail: string
  description: string
  budget: number
  currency: string
  deadline: string | null
  plan: ProjectPlanDetails | null
  createdAt: string
  milestones: ApiMilestone[]
  scopeChanges: ApiScopeChange[]
}

type ApiScopeChange = {
  id: string
  projectId: string
  originalRequirement: string
  newRequirement: string
  aiAnalysis: unknown
  status: 'PENDING' | 'REVIEWED' | 'ACCEPTED' | 'REJECTED'
  createdAt: string
}

export type Payment = {
  id: string
  milestoneId: string
  paypalOrderId: string | null
  amount: number
  currency: string
  status: 'CREATING' | 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED'
  createdAt: string
  milestone: {
    id: string
    title: string
    project: { id: string; title: string; clientName: string }
  }
}

export class ApiError extends Error {
  readonly status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const csrfToken = readCsrfCookie()
  let response: Response
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      credentials: 'include',
      headers: {
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...(csrfToken && init?.method && !['GET', 'HEAD', 'OPTIONS'].includes(init.method.toUpperCase())
          ? { 'X-CSRF-Token': csrfToken }
          : {}),
        ...init?.headers,
      },
    })
  } catch {
    throw new ApiError(`Could not reach the ScopePay API at ${apiBaseUrl}. Check that the backend is running.`)
  }

  if (!response.ok) {
    if (
      response.status === 401 &&
      !['/api/auth/login', '/api/auth/register', '/api/auth/signup', '/api/auth/forgot-password', '/api/auth/reset-password'].includes(path) &&
      typeof window !== 'undefined'
    ) {
      window.dispatchEvent(new Event('scopepay:unauthorized'))
    }
    const body: unknown = await response.json().catch(() => null)
    const message =
      typeof body === 'object' &&
      body !== null &&
      'error' in body &&
      typeof body.error === 'string'
        ? body.error
        : `Request failed with status ${response.status}`
    throw new ApiError(message, response.status)
  }

  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

function mapMilestone(milestone: ApiMilestone): Milestone {
  return {
    id: milestone.id,
    title: milestone.title,
    description: milestone.description,
    amountCents: milestone.amount,
    dueDate: milestone.dueDate?.slice(0, 10) ?? '',
    deliverables: Array.isArray(milestone.deliverables) &&
      milestone.deliverables.every((item) => typeof item === 'string')
      ? milestone.deliverables
      : [],
    estimatedDays: milestone.estimatedDays,
    status: milestone.status === 'PAID' ? 'paid' : 'pending',
  }
}

function mapScopeChange(scopeChange: ApiScopeChange): ScopeChange {
  return {
    id: scopeChange.id,
    projectId: scopeChange.projectId,
    originalRequirement: scopeChange.originalRequirement,
    newRequirement: scopeChange.newRequirement,
    aiAnalysis: mapScopeAnalysis(scopeChange.aiAnalysis),
    status: scopeChange.status,
    createdAt: scopeChange.createdAt,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isScopeImpact(value: unknown): value is ScopeAnalysis['impact'] {
  return value === 'LOW' || value === 'MEDIUM' || value === 'HIGH'
}

function mapScopeAnalysis(value: unknown): ScopeAnalysis | null {
  if (!isRecord(value)) return null
  if (
    typeof value.summary !== 'string' ||
    !isScopeImpact(value.impact) ||
    !isStringArray(value.addedWork) ||
    !isStringArray(value.risks) ||
    !isStringArray(value.clarificationQuestions)
  ) return null

  return {
    summary: value.summary,
    impact: value.impact,
    addedWork: value.addedWork,
    risks: value.risks,
    clarificationQuestions: value.clarificationQuestions,
  }
}

function mapProject(project: ApiProject): Project {
  const milestones = project.milestones.map(mapMilestone)
  return {
    id: project.id,
    title: project.title,
    clientName: project.clientName,
    clientEmail: project.clientEmail,
    brief: project.description,
    budgetCents: project.budget,
    currency: project.currency,
    deadline: project.deadline,
    plan: project.plan,
    createdAt: project.createdAt.slice(0, 10),
    status:
      milestones.length > 0 && milestones.every((milestone) => milestone.status === 'paid')
        ? 'completed'
        : 'in progress',
    milestones,
    scopeChanges: (project.scopeChanges ?? []).map(mapScopeChange),
  }
}

export async function register(input: { name: string; email: string; password: string }) {
  const result = await request<{ user: User }>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return result.user
}

export async function login(input: { email: string; password: string }) {
  const result = await request<{ user: User }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return result.user
}

export async function getCurrentUser() {
  const result = await request<{ user: User }>('/api/auth/me')
  return result.user
}

export async function logout() {
  await request<void>('/api/auth/logout', { method: 'POST' })
}

export async function requestPasswordReset(email: string) {
  return request<{ message: string }>('/api/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  })
}

export async function resetPassword(token: string, password: string) {
  return request<{ message: string }>('/api/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, password }),
  })
}

export async function updateProfile(profile: { name?: string; email?: string }) {
  return request<{ user: User }>('/api/auth/profile', {
    method: 'PATCH',
    body: JSON.stringify(profile),
  })
}

export async function changePassword(input: { currentPassword: string; newPassword: string }) {
  return request<{ user: User }>('/api/auth/change-password', {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export async function getProjects() {
  const projects = await request<ApiProject[]>('/api/projects')
  return projects.map(mapProject)
}

export async function getPayments() {
  return request<Payment[]>('/api/payments')
}

export async function createProject(project: ProjectDraft) {
  const created = await request<ApiProject>('/api/projects', {
    method: 'POST',
    body: JSON.stringify({
      title: project.title,
      clientName: project.clientName,
      clientEmail: project.clientEmail,
      description: project.brief,
      budget: project.budgetCents,
      currency: project.currency,
      ...(project.deadline ? { deadline: project.deadline } : {}),
      ...(project.plan && project.milestones
        ? {
            plan: project.plan,
            milestones: project.milestones.map((milestone) => ({
              title: milestone.title,
              description: milestone.description,
              deliverables: milestone.deliverables,
              estimatedDays: milestone.estimatedDays,
              amount: milestone.amountCents,
            })),
          }
        : {}),
    }),
  })
  return mapProject(created)
}

export async function analyzeProject(input: {
  description: string
  budget: number
  currency: string
  deadline: string
}) {
  return request<GeneratedProjectPlan>('/api/ai/analyze-project', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function createMilestone(projectId: string, milestone: MilestoneDraft) {
  await request<ApiMilestone>(`/api/projects/${encodeURIComponent(projectId)}/milestones`, {
    method: 'POST',
    body: JSON.stringify({
      title: milestone.title,
      description: milestone.description,
      amount: milestone.amountCents,
      dueDate: milestone.dueDate || null,
    }),
  })
}

export async function updateMilestone(id: string, milestone: MilestoneDraft) {
  await request<ApiMilestone>(`/api/milestones/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({
      title: milestone.title,
      description: milestone.description,
      amount: milestone.amountCents,
      dueDate: milestone.dueDate || null,
    }),
  })
}

export async function deleteMilestone(id: string) {
  await request<void>(`/api/milestones/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export async function createScopeChange(projectId: string, change: ScopeChangeDraft) {
  const created = await request<ApiScopeChange>(`/api/projects/${encodeURIComponent(projectId)}/scope-changes`, {
    method: 'POST',
    body: JSON.stringify({
      originalRequirement: change.originalRequirement,
      newRequirement: change.newRequirement,
      aiAnalysis: change.aiAnalysis ?? null,
      status: change.status,
    }),
  })
  return mapScopeChange(created)
}

export async function analyzeScopeChange(
  projectId: string,
  requirements: { originalRequirement: string; newRequirement: string },
) {
  return request<ScopeAnalysis>(
    `/api/projects/${encodeURIComponent(projectId)}/scope-changes/analyze`,
    {
      method: 'POST',
      body: JSON.stringify(requirements),
    },
  )
}

export async function updateScopeChange(id: string, change: Partial<ScopeChangeDraft>) {
  const updated = await request<ApiScopeChange>(`/api/scope-changes/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({
      ...(change.originalRequirement !== undefined ? { originalRequirement: change.originalRequirement } : {}),
      ...(change.newRequirement !== undefined ? { newRequirement: change.newRequirement } : {}),
      ...(change.aiAnalysis !== undefined ? { aiAnalysis: change.aiAnalysis } : {}),
      ...(change.status !== undefined ? { status: change.status } : {}),
    }),
  })
  return mapScopeChange(updated)
}

export async function deleteScopeChange(id: string) {
  await request<void>(`/api/scope-changes/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export async function createPaypalOrder(milestoneId: string) {
  return request<{ orderId: string }>('/api/paypal/create-order', {
    method: 'POST',
    body: JSON.stringify({ milestoneId }),
  })
}

export async function capturePaypalOrder(orderId: string) {
  return request<{ status: 'COMPLETED'; milestoneId: string }>('/api/paypal/capture-order', {
    method: 'POST',
    body: JSON.stringify({ orderId }),
  })
}

export async function cancelPaypalOrder(orderId: string) {
  await request<void>('/api/paypal/cancel-order', {
    method: 'POST',
    body: JSON.stringify({ orderId }),
  })
}
