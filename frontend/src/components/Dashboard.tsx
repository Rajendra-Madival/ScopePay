import type { Project } from '../types'
import { Icon } from './Icon'
import { Button, PageHeading, ProjectStatusBadge } from './Primitives'
import { formatMoney } from '../utils/format'

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
}: {
  projects: Project[]
  onCreate: () => void
  onOpenProject: (id: string) => void
  onViewProjects: () => void
}) {
  const allMilestones = projects.flatMap((project) =>
    project.milestones.map((milestone) => ({ project, milestone })),
  )
  const collected = allMilestones
    .filter(({ milestone }) => milestone.status === 'paid')
    .reduce((sum, { milestone }) => sum + milestone.amountCents, 0)
  const upcoming = allMilestones
    .filter(({ milestone }) => milestone.status === 'pending')
    .reduce((sum, { milestone }) => sum + milestone.amountCents, 0)
  const activeProjects = projects.filter((project) => project.status === 'in progress').length

  const stats = [
    { title: 'Total collected', value: formatMoney(collected), icon: 'wallet' as const, note: 'From completed milestones', tone: 'green' },
    { title: 'Awaiting payment', value: formatMoney(upcoming), icon: 'clock' as const, note: `${allMilestones.filter(({ milestone }) => milestone.status === 'pending').length} pending milestones`, tone: 'amber' },
    { title: 'Active projects', value: String(activeProjects).padStart(2, '0'), icon: 'briefcase' as const, note: `${projects.length} projects in workspace`, tone: 'blue' },
    { title: 'Milestones', value: String(allMilestones.length).padStart(2, '0'), icon: 'layers' as const, note: `${allMilestones.filter(({ milestone }) => milestone.status === 'paid').length} paid`, tone: 'purple' },
  ]

  return (
    <>
      <PageHeading
        eyebrow="Project overview"
        title="Good morning, Alex"
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
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#edf3ee] text-xs font-bold text-forest-800">{initials(project.clientName)}</span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-stone-800">{project.title}</span>
                      <span className="mt-0.5 block text-xs text-stone-400 sm:hidden">{project.clientName}</span>
                    </span>
                  </span>
                  <span className="hidden text-sm text-stone-600 sm:block">{project.clientName}</span>
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
                    <span className="block text-sm font-semibold text-stone-800">{formatMoney(project.budgetCents)}</span>
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
