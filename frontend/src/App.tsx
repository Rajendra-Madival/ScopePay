import { useEffect, useState } from 'react'
import { PayPalScriptProvider } from '@paypal/react-paypal-js'
import { ApiError, createMilestone, createProject, deleteMilestone, getPayments, getProjects, updateMilestone } from './lib/api'
import type { Payment } from './lib/api'
import { AppShell } from './components/AppShell'
import type { Page } from './components/AppShell'
import { Dashboard } from './components/Dashboard'
import { PaymentsPage } from './components/PaymentsPage'
import { ProjectDetails } from './components/ProjectDetails'
import { ProjectForm } from './components/ProjectForm'
import { ProjectsPage } from './components/ProjectsPage'
import type { MilestoneDraft, Project, ProjectDraft } from './types'

const paypalClientId = import.meta.env.VITE_PAYPAL_CLIENT_ID?.trim() ?? ''

function App() {
  const [projects, setProjects] = useState<Project[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [page, setPage] = useState<Page>('dashboard')
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  async function refreshWorkspace() {
    const [nextProjects, nextPayments] = await Promise.all([getProjects(), getPayments()])
    setProjects(nextProjects)
    setPayments(nextPayments)
    setLoadError('')
  }

  useEffect(() => {
    let active = true
    Promise.all([getProjects(), getPayments()])
      .then(([nextProjects, nextPayments]) => {
        if (!active) return
        setProjects(nextProjects)
        setPayments(nextPayments)
      })
      .catch((cause: unknown) => {
        if (active) setLoadError(cause instanceof ApiError ? cause.message : 'ScopePay could not load workspace data.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [])

  async function refreshProjects() {
    const nextProjects = await getProjects()
    setProjects(nextProjects)
  }

  async function openProject(id: string) {
    setSelectedProjectId(id)
    setPage('details')
  }

  async function saveProject(draft: ProjectDraft) {
    const project = await createProject(draft)
    setProjects((current) => [project, ...current])
    setSelectedProjectId(project.id)
    setPage('details')
  }

  async function refreshAfterPayment() {
    await refreshWorkspace()
  }

  async function addMilestone(projectId: string, draft: MilestoneDraft) {
    await createMilestone(projectId, draft)
    await refreshProjects()
  }

  async function editMilestone(id: string, draft: MilestoneDraft) {
    await updateMilestone(id, draft)
    await refreshProjects()
  }

  async function removeMilestone(id: string) {
    await deleteMilestone(id)
    await refreshProjects()
  }

  const selectedProject = projects.find((project) => project.id === selectedProjectId)
  const content = loading ? (
    <div aria-live="polite" className="rounded-2xl border border-stone-200 bg-white px-5 py-12 text-center text-sm text-stone-500">Loading projects from the ScopePay API…</div>
  ) : loadError ? (
    <div className="rounded-2xl border border-rose-100 bg-white px-5 py-12 text-center">
      <h1 className="text-lg font-semibold text-stone-900">Couldn’t load your workspace</h1>
      <p className="mx-auto mt-2 max-w-lg text-sm text-rose-700" role="alert">{loadError}</p>
      <button className="mt-5 rounded-xl bg-forest-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-forest-800" onClick={() => {
        setLoading(true)
        Promise.all([getProjects(), getPayments()])
          .then(([nextProjects, nextPayments]) => {
            setProjects(nextProjects)
            setPayments(nextPayments)
            setLoadError('')
          })
          .catch((cause: unknown) => setLoadError(cause instanceof ApiError ? cause.message : 'ScopePay could not load workspace data.'))
          .finally(() => setLoading(false))
      }}>Try again</button>
    </div>
  ) : (
    <>
      {page === 'dashboard' && (
        <Dashboard
          onCreate={() => setPage('create')}
          onOpenProject={openProject}
          onViewProjects={() => setPage('projects')}
          projects={projects}
        />
      )}
      {page === 'projects' && (
        <ProjectsPage onCreate={() => setPage('create')} onOpen={openProject} projects={projects} />
      )}
      {page === 'create' && (
        <ProjectForm onCancel={() => setPage('projects')} onSave={saveProject} />
      )}
      {page === 'details' && selectedProject && (
        <ProjectDetails
          key={selectedProject.id}
          onAddMilestone={(draft) => addMilestone(selectedProject.id, draft)}
          onBack={() => setPage('projects')}
          onDeleteMilestone={removeMilestone}
          onEditMilestone={editMilestone}
          onPaymentConfirmed={refreshAfterPayment}
          paypalConfigured={Boolean(paypalClientId)}
          project={selectedProject}
        />
      )}
      {page === 'details' && !selectedProject && (
        <div className="rounded-2xl border border-stone-200 bg-white px-5 py-12 text-center">
          <h1 className="text-lg font-semibold text-stone-900">Project not found</h1>
          <button className="mt-4 text-sm font-semibold text-forest-700" onClick={() => setPage('projects')}>Back to projects</button>
        </div>
      )}
      {page === 'payments' && (
        <PaymentsPage onOpenProject={openProject} payments={payments} />
      )}
    </>
  )

  const shell = (
    <AppShell page={page} onCreate={() => setPage('create')} onNavigate={setPage}>
      {content}
    </AppShell>
  )

  if (!paypalClientId) return shell

  return (
    <PayPalScriptProvider options={{ clientId: paypalClientId, currency: 'USD', intent: 'capture' }}>
      {shell}
    </PayPalScriptProvider>
  )
}

export default App
