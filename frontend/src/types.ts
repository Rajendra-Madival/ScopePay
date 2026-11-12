export type MilestoneStatus = 'paid' | 'pending'

export type Milestone = {
  id: string
  title: string
  description: string
  amountCents: number
  dueDate: string
  deliverables: string[]
  estimatedDays: number | null
  status: MilestoneStatus
}

export type User = {
  id: string
  name: string
  email: string
}

export type ScopeChangeStatus = 'PENDING' | 'REVIEWED' | 'ACCEPTED' | 'REJECTED'

export type ScopeAnalysis = {
  summary: string
  impact: 'LOW' | 'MEDIUM' | 'HIGH'
  addedWork: string[]
  risks: string[]
  clarificationQuestions: string[]
}

export type ScopeChange = {
  id: string
  projectId: string
  originalRequirement: string
  newRequirement: string
  aiAnalysis: ScopeAnalysis | null
  status: ScopeChangeStatus
  createdAt: string
}

export type Project = {
  id: string
  title: string
  clientName: string
  clientEmail: string
  brief: string
  budgetCents: number
  currency: string
  deadline: string | null
  plan: ProjectPlanDetails | null
  createdAt: string
  status: 'in progress' | 'completed'
  milestones: Milestone[]
  scopeChanges: ScopeChange[]
}

export type ProjectPlanDetails = {
  summary: string
  requirements: string[]
  assumptions: string[]
  risks: string[]
  missingInformation: string[]
  clientQuestions: string[]
  estimatedDurationDays: number
}

export type ProjectPlanMilestoneDraft = {
  title: string
  description: string
  deliverables: string[]
  estimatedDays: number
  amountCents: number
}

export type ProjectDraft = Pick<
  Project,
  'title' | 'clientName' | 'clientEmail' | 'brief' | 'budgetCents' | 'currency'
> & {
  deadline?: string
  plan?: ProjectPlanDetails
  milestones?: ProjectPlanMilestoneDraft[]
}

export type MilestoneDraft = Omit<Milestone, 'id'>

export type ScopeChangeDraft = Omit<ScopeChange, 'id' | 'projectId' | 'createdAt'>

