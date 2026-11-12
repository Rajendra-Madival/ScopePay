import type { Project } from '../types'
import { Icon } from './Icon'
import { Button, PageHeading, ProjectStatusBadge } from './Primitives'
import { formatMoney, formatMoneyTotals } from '../utils/format'

function initials(name: string) {
  return name
    .split(' ')
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
}

export function Dashboard({
  projects,
  onCreate,
  onOpenProject,
  onViewProjects,
  userName,
}: {
  projects: Project[]
  onCreate: () => void
  onOpenProject: (id: string) => void
  onViewProjects: () => void
  userName?: string
}) {
  const allMilestones = projects.flatMap((project) =>
    project.milestones.map((milestone) => ({ project, milestone })),
  )
  const collected = allMilestones
    .filter(({ milestone }) => milestone.status === 'paid')
    .map(({ project, milestone }) => ({ amountCents: milestone.amountCents, currency: project.currency }))
  const upcoming = allMilestones
    .filter(({ milestone }) => milestone.status === 'pending')
    .map(({ project, milestone }) => ({ amountCents: milestone.amountCents, currency: project.currency }))
  const activeProjects = projects.filter((project) => project.status === 'in progress').length
  const upcomingDeliveries = allMilestones
    .filter(({ milestone }) => milestone.status === 'pending')
    .sort((left, right) => left.project.title.localeCompare(right.project.title))
    .slice(0, 3)

  const stats = [
    { title: 'Total collected', value: formatMoneyTotals(collected), icon: 'wallet' as const, note: 'From completed milestones', tone: 'green' },
    { title: 'Awaiting payment', value: formatMoneyTotals(upcoming), icon: 'clock' as const, note: `${allMilestones.filter(({ milestone }) => milestone.status === 'pending').length} pending milestones`, tone: 'amber' },
    { title: 'Active projects', value: String(activeProjects).padStart(2, '0'), icon: 'briefcase' as const, note: `${projects.length} projects in workspace`, tone: 'blue' },
    { title: 'Milestones', value: String(allMilestones.length).padStart(2, '0'), icon: 'layers' as const, note: `${allMilestones.filter(({ milestone }) => milestone.status === 'paid').length} paid`, tone: 'purple' },
  ]

  return (
    <>
      <PageHeading
        eyebrow="Project overview"
        title={userName ? `Good morning, ${userName.split(' ')[0]}` : 'Good morning'}
        description="Here’s what’s happening across your projects."
        action={<Button icon="plus" onClick={onCreate}>New project</Button>}
      />

      <section aria-label="Workspace overview" className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
        {stats.map((stat) => (
          <div className="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(27,39,30,0.03)] sm:p-5" key={stat.title}>
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-stone-500">{stat.title}</p>
              <span className={`flex size-9 items-center justify-center rounded-xl ${
                stat.tone === 'green' ? 'bg-emerald-50 text-emerald-700' :
                stat.tone === 'amber' ? 'bg-amber-50 text-amber-700' :
                stat.tone === 'blue' ? 'bg-sky-50 text-sky-700' : 'bg-violet-50 text-violet-700'
              }`}>
                <Icon className="size-[17px]" name={stat.icon} />
              </span>
            </div>
            <p className="mt-4 text-[27px] font-semibold tracking-tight text-stone-900">{stat.value}</p>
            <p className="mt-1 text-xs text-stone-400">{stat.note}</p>
          </div>
        ))}
      </section>

      <section className="mb-8 grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
        <div className="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(27,39,30,0.03)]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.15em] text-forest-700">Quick actions</p>
              <h2 className="mt-2 text-lg font-semibold text-stone-900">Client check-ins</h2>
            </div>
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">Updated today</span>
          </div>
          <div className="mt-5 space-y-3">
            {upcomingDeliveries.length > 0 ? upcomingDeliveries.map(({ project, milestone }) => (
              <div className="flex items-center justify-between rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5" key={`${project.id}-${milestone.id}`}>
                <div>
                  <p className="text-sm font-semibold text-stone-800">{milestone.title}</p>
                  <p className="text-xs text-stone-500">{project.clientName || 'Client not specified'} · {project.title}</p>
                </div>
                <span className="text-sm font-semibold text-forest-700">{formatMoney(milestone.amountCents, project.currency)}</span>
              </div>
            )) : (
              <p className="rounded-xl border border-dashed border-stone-200 bg-stone-50 px-3 py-4 text-sm text-stone-500">No upcoming milestones. You’re all caught up.</p>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-stone-200/80 bg-gradient-to-br from-forest-700 to-forest-800 p-5 text-white shadow-[0_1px_2px_rgba(27,39,30,0.03)]">
          <p className="text-xs font-bold uppercase tracking-[0.15em] text-emerald-100">Momentum</p>
          <h2 className="mt-2 text-2xl font-semibold">{activeProjects} active projects</h2>
          <p className="mt-2 text-sm text-emerald-50">Your pipeline is healthy, and your next milestone plan is ready for review.</p>
          <button className="mt-5 inline-flex items-center gap-2 rounded-xl bg-white/12 px-3 py-2 text-sm font-semibold text-white transition hover:bg-white/16" onClick={onViewProjects} type="button">
            Review workspace
            <Icon className="size-4" name="arrow-right" />
          </button>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-[0_1px_2px_rgba(27,39,30,0.03)]">
        <div className="flex items-center justify-between border-b border-stone-100 px-5 py-4 sm:px-6">
          <div>
            <h2 className="text-base font-semibold text-stone-900">Recent projects</h2>
            <p className="mt-0.5 text-xs text-stone-500">A quick look at your latest client work</p>
          </div>
          <Button className="px-2.5" icon="arrow-right" variant="quiet" onClick={onViewProjects}>All projects</Button>
        </div>
        {projects.length === 0 ? (
          <div className="px-5 py-14 text-center">
            <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-stone-50 text-stone-400">
              <Icon className="size-5" name="briefcase" />
            </div>
            <h3 className="text-sm font-semibold text-stone-800">Your next project starts here</h3>
            <p className="mx-auto mt-1 max-w-xs text-sm text-stone-500">Add your first client project to keep the scope and milestones in one place.</p>
            <Button className="mt-5" icon="plus" onClick={onCreate}>Create a project</Button>
          </div>
        ) : (
          <>
            <div className="hidden grid-cols-[minmax(190px,1.5fr)_minmax(130px,1fr)_minmax(110px,.8fr)_minmax(110px,.8fr)_24px] items-center gap-4 bg-stone-50/70 px-6 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-stone-400 sm:grid">
              <span>Project</span><span>Client</span><span>Progress</span><span>Budget</span><span />
            </div>
            {projects.slice(0, 4).map((project) => {
              const paid = project.milestones.filter((item) => item.status === 'paid').length
              const progress = project.milestones.length ? Math.round((paid / project.milestones.length) * 100) : 0
              return (
                <button
                  className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-3 border-b border-stone-100 px-5 py-4 text-left transition-colors last:border-b-0 hover:bg-stone-50/60 sm:grid-cols-[minmax(190px,1.5fr)_minmax(130px,1fr)_minmax(110px,.8fr)_minmax(110px,.8fr)_24px] sm:gap-4 sm:px-6"
                  key={project.id}
                  onClick={() => onOpenProject(project.id)}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#edf3ee] text-xs font-bold text-forest-800">{initials(project.clientName || 'Client')}</span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-stone-800">{project.title}</span>
                      <span className="mt-0.5 block text-xs text-stone-400 sm:hidden">{project.clientName || 'Client not specified'}</span>
                    </span>
                  </span>
                  <span className="hidden text-sm text-stone-600 sm:block">{project.clientName || 'Client not specified'}</span>
                  <span className="hidden sm:block">
                    {project.milestones.length ? (
                      <>
                        <span className="mb-1.5 flex justify-between text-xs text-stone-500"><span>{paid}/{project.milestones.length} paid</span><span>{progress}%</span></span>
                        <span className="block h-1.5 overflow-hidden rounded-full bg-stone-100"><span className="block h-full rounded-full bg-forest-600" style={{ width: `${progress}%` }} /></span>
                      </>
                    ) : (
                      <span className="text-xs text-stone-400">No milestones yet</span>
                    )}
                  </span>
                  <span className="justify-self-end text-right sm:justify-self-start sm:text-left">
                    <span className="block text-sm font-semibold text-stone-800">{formatMoney(project.budgetCents, project.currency)}</span>
                    <span className="mt-0.5 block sm:hidden"><ProjectStatusBadge completed={project.status === 'completed'} /></span>
                    <span className="hidden text-xs capitalize text-stone-400 sm:block">{project.status}</span>
                  </span>
                  <Icon className="hidden size-4 text-stone-300 sm:block" name="arrow-right" />
                </button>
              )
            })}
            <div className="flex items-center gap-2 border-t border-stone-100 bg-stone-50/70 px-5 py-3 text-xs text-stone-500 sm:px-6">
              <Icon className="size-4 shrink-0" name="clock" />
              <span>Paid totals include milestones marked paid after a completed checkout.</span>
            </div>
          </>
        )}
      </section>
    </>
  )
}
