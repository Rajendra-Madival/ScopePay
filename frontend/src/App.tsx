import { useEffect, useState } from 'react'
import { PayPalScriptProvider } from '@paypal/react-paypal-js'
import {
  ApiError,
  changePassword,
  createMilestone,
  createProject,
  deleteMilestone,
  getCurrentUser,
  getPayments,
  getProjects,
  login,
  logout,
  register,
  requestPasswordReset,
  resetPassword,
  updateMilestone,
  updateProfile,
} from './lib/api'
import type { Payment } from './lib/api'
import { AppShell } from './components/AppShell'
import type { Page } from './components/AppShell'
import { AuthScreen } from './components/AuthScreen'
import { Dashboard } from './components/Dashboard'
import { PaymentsPage } from './components/PaymentsPage'
import { ProjectDetails } from './components/ProjectDetails'
import { ProjectForm } from './components/ProjectForm'
import { ProfilePage } from './components/ProfilePage'
import { ProjectsPage } from './components/ProjectsPage'
import type { MilestoneDraft, Project, ProjectDraft, User } from './types'

const paypalClientId = import.meta.env.VITE_PAYPAL_CLIENT_ID?.trim() ?? ''

function App() {
  const [user, setUser] = useState<User | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [page, setPage] = useState<Page>(() =>
    window.location.pathname === '/profile' ? 'profile' : 'dashboard',
  )
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [route, setRoute] = useState(() => window.location.pathname)
  const [resetToken, setResetToken] = useState(() => new URLSearchParams(window.location.search).get('token') ?? '')
  const [authChecking, setAuthChecking] = useState(true)
  const [authError, setAuthError] = useState('')
  const [authAttempt, setAuthAttempt] = useState(0)

  function navigatePath(path: string, replace = false) {
    if (replace) window.history.replaceState(null, '', path)
    else window.history.pushState(null, '', path)
    setRoute(window.location.pathname)
    setResetToken(new URLSearchParams(window.location.search).get('token') ?? '')
  }

  useEffect(() => {
    const handlePopState = () => {
      setRoute(window.location.pathname)
      setResetToken(new URLSearchParams(window.location.search).get('token') ?? '')
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    window.localStorage.removeItem('scopepay-session')
  }, [])

  useEffect(() => {
    const handleUnauthorized = () => {
      if (!user) return
      const currentPath = window.location.pathname
      setUser(null)
      setProjects([])
      setPayments([])
      setPage('dashboard')
      setSelectedProjectId(null)
      navigatePath(`/login?next=${encodeURIComponent(currentPath)}`, true)
    }

    window.addEventListener('scopepay:unauthorized', handleUnauthorized)
    return () => window.removeEventListener('scopepay:unauthorized', handleUnauthorized)
  }, [user])

  useEffect(() => {
    let active = true
    getCurrentUser()
      .then((currentUser) => {
        if (!active) return
        setUser(currentUser)
        if (['/login', '/signup', '/forgot-password', '/reset-password'].includes(window.location.pathname)) {
          navigatePath('/', true)
        }
      })
      .catch((cause: unknown) => {
        if (!active) return
        if (cause instanceof ApiError && cause.status === 401) {
          setUser(null)
          const currentPath = window.location.pathname
          if (!['/login', '/signup', '/forgot-password', '/reset-password'].includes(currentPath)) {
            navigatePath(`/login?next=${encodeURIComponent(currentPath)}`, true)
          }
        } else {
          setAuthError(cause instanceof Error ? cause.message : 'ScopePay could not verify your session.')
        }
      })
      .finally(() => {
        if (active) setAuthChecking(false)
      })
    return () => { active = false }
  }, [authAttempt])

  useEffect(() => {
    if (route !== '/reset-password' || !window.location.search) return
    window.history.replaceState(null, '', '/reset-password')
  }, [route])

  async function refreshWorkspace() {
    const [nextProjects, nextPayments] = await Promise.all([getProjects(), getPayments()])
    setProjects(nextProjects)
    setPayments(nextPayments)
    setLoadError('')
  }

  useEffect(() => {
    if (!user) return

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
  }, [user])

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

  async function handleAuthLogin(input: { email: string; password: string }) {
    const nextUser = await login(input)
    const requestedPath = new URLSearchParams(window.location.search).get('next')
    const destination = requestedPath?.startsWith('/') && !requestedPath.startsWith('//')
      ? requestedPath
      : '/'
    setUser(nextUser)
    setLoading(true)
    setPage(destination === '/profile' ? 'profile' : 'dashboard')
    setLoadError('')
    navigatePath(destination)
  }

  async function handleAuthRegister(input: { name: string; email: string; password: string }) {
    const nextUser = await register(input)
    setUser(nextUser)
    setLoading(true)
    setPage('dashboard')
    setLoadError('')
    navigatePath('/')
  }

  async function handleLogout() {
    try {
      await logout()
      setUser(null)
      setProjects([])
      setPayments([])
      setPage('dashboard')
      setSelectedProjectId(null)
      navigatePath('/login', true)
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : 'You could not be logged out.')
    }
  }

  async function handleSaveProfile(input: { name: string; email: string }) {
    const result = await updateProfile(input)
    setUser(result.user)
    return result.user
  }

  async function handleChangePassword(input: { currentPassword: string; newPassword: string }) {
    const result = await changePassword(input)
    setUser(result.user)
    return result.user
  }

  if (authChecking) {
    return <div aria-live="polite" className="flex min-h-screen items-center justify-center bg-[#f7f8f6] text-sm text-stone-500">Checking your secure session…</div>
  }

  if (authError && !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f7f8f6] px-4">
        <div className="w-full max-w-lg rounded-2xl border border-rose-100 bg-white p-7 text-center">
          <h1 className="text-lg font-semibold text-stone-900">Couldn’t verify your session</h1>
          <p className="mt-2 text-sm text-rose-700" role="alert">{authError}</p>
          <button
            className="mt-5 rounded-xl bg-forest-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-forest-800"
            onClick={() => {
              setAuthError('')
              setAuthChecking(true)
              setAuthAttempt((attempt) => attempt + 1)
            }}
            type="button"
          >
            Try again
          </button>
        </div>
      </div>
    )
  }

  if (!user) {
    const modes = {
      '/signup': 'signup',
      '/forgot-password': 'forgot-password',
      '/reset-password': 'reset-password',
    } as const
    const mode = modes[route as keyof typeof modes] ?? 'login'
    return (
      <AuthScreen
        mode={mode}
        onForgotPassword={async (email) => (await requestPasswordReset(email)).message}
        onLogin={handleAuthLogin}
        onNavigate={navigatePath}
        onRegister={handleAuthRegister}
        onResetPassword={async (token, password) => { await resetPassword(token, password) }}
        resetToken={resetToken}
      />
    )
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
          userName={user.name}
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
      {page === 'profile' && (
        <ProfilePage
          onChangePassword={handleChangePassword}
          onSaveProfile={handleSaveProfile}
          user={user}
        />
      )}
    </>
  )

  const shell = (
    <AppShell
      page={page}
      onCreate={() => setPage('create')}
      onLogout={() => { void handleLogout() }}
      onNavigate={(nextPage) => {
        setPage(nextPage)
        if (nextPage === 'profile') navigatePath('/profile')
        else if (route === '/profile') navigatePath('/')
      }}
      user={user}
    >
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
