export type MilestoneStatus = 'paid' | 'pending'

export type Milestone = {
  id: string
  title: string
  description: string
  amountCents: number
  dueDate: string
  status: MilestoneStatus
}

export type Project = {
  id: string
  title: string
  clientName: string
  clientEmail: string
  brief: string
  budgetCents: number
  createdAt: string
  status: 'in progress' | 'completed'
  milestones: Milestone[]
}

export type ProjectDraft = Omit<Project, 'id' | 'createdAt' | 'milestones'>

export type MilestoneDraft = Omit<Milestone, 'id'>

