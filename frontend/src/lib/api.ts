import type { Milestone, MilestoneDraft, Project, ProjectDraft } from '../types'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000'

type ApiMilestone = {
  id: string
  projectId: string
  title: string
  description: string
  amount: number
  status: 'PENDING' | 'PAID'
  dueDate: string | null
  createdAt: string
}

type ApiProject = {
  id: string
  title: string
  clientName: string
  clientEmail: string
  description: string
  budget: number
  currency: string
  createdAt: string
  milestones: ApiMilestone[]
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
  let response: Response
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      headers: {
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
    })
  } catch {
    throw new ApiError(`Could not reach the ScopePay API at ${apiBaseUrl}. Check that the backend is running.`)
  }

  if (!response.ok) {
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
    status: milestone.status === 'PAID' ? 'paid' : 'pending',
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
    createdAt: project.createdAt.slice(0, 10),
    status:
      milestones.length > 0 && milestones.every((milestone) => milestone.status === 'paid')
        ? 'completed'
        : 'in progress',
    milestones,
  }
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
      currency: 'USD',
    }),
  })
  return mapProject(created)
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
