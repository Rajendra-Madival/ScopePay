import { useMemo, useState } from 'react'
import type { Project } from '../types'
import { Icon } from './Icon'
import { Button, PageHeading, ProjectStatusBadge } from './Primitives'
import { formatDate, formatMoney } from '../utils/format'

export function ProjectsPage({
  projects,
  onCreate,
  onOpen,
}: {
  projects: Project[]
  onCreate: () => void
  onOpen: (id: string) => void
}) {
  const [query, setQuery] = useState('')
  const filtered = useMemo(
    () =>
      projects.filter((project) =>
        `${project.title} ${project.clientName}`.toLowerCase().includes(query.toLowerCase()),
      ),
    [projects, query],
  )

  return (
    <>
      <PageHeading
        eyebrow="Your workspace"
        title="Projects"
        description="Keep every brief, milestone, and payment status in view."
        action={<Button icon="plus" onClick={onCreate}>New project</Button>}
      />
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-stone-500">{projects.length} projects <span className="text-stone-300">·</span> Workspace data</p>
        <label className="flex h-10 w-full items-center gap-2.5 rounded-xl border border-stone-200 bg-white px-3 text-stone-400 sm:max-w-[280px]">
          <Icon className="size-4 shrink-0" name="search" />
          <input className="w-full bg-transparent text-sm text-stone-800 outline-none placeholder:text-stone-400" onChange={(event) => setQuery(event.target.value)} placeholder="Search projects" value={query} />
        </label>
      </div>
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-300 bg-white px-5 py-16 text-center">
          <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-stone-50 text-stone-400">
            <Icon className="size-5" name={projects.length ? 'search' : 'briefcase'} />
          </div>
          <h2 className="text-sm font-semibold text-stone-800">{projects.length ? 'No matching projects' : 'Your project list is ready'}</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-stone-500">{projects.length ? 'Try another project or client name.' : 'Create a project to start organizing a client brief and its milestones.'}</p>
          {!projects.length && <Button className="mt-5" icon="plus" onClick={onCreate}>Create a project</Button>}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((project) => {
            const paid = project.milestones.filter((item) => item.status === 'paid').length
            const pendingCents = project.milestones.filter((item) => item.status === 'pending').reduce((sum, item) => sum + item.amountCents, 0)
            return (
              <button className="group rounded-2xl border border-stone-200/80 bg-white p-5 text-left shadow-[0_1px_2px_rgba(27,39,30,0.03)] transition-all hover:-translate-y-0.5 hover:border-stone-300 hover:shadow-md sm:p-6" key={project.id} onClick={() => onOpen(project.id)}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex size-10 items-center justify-center rounded-xl bg-[#edf3ee] text-forest-800">
                    <Icon className="size-[19px]" name="file" />
                  </div>
                  <ProjectStatusBadge completed={project.status === 'completed'} />
                </div>
                <h2 className="mt-5 text-base font-semibold text-stone-900 group-hover:text-forest-800">{project.title}</h2>
                <p className="mt-1 text-sm text-stone-500">{project.clientName}</p>
                <div className="my-5 border-t border-stone-100" />
                <div className="grid grid-cols-2 gap-3">
                  <div><p className="text-xs text-stone-400">Project budget</p><p className="mt-1 text-sm font-semibold text-stone-800">{formatMoney(project.budgetCents)}</p></div>
                  <div><p className="text-xs text-stone-400">Awaiting payment</p><p className="mt-1 text-sm font-semibold text-stone-800">{formatMoney(pendingCents)}</p></div>
                </div>
                <div className="mt-5 flex items-center justify-between border-t border-stone-100 pt-4 text-xs text-stone-400">
                  <span>{paid} of {project.milestones.length} milestones paid</span>
                  <span>Created {formatDate(project.createdAt)}</span>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </>
  )
}
