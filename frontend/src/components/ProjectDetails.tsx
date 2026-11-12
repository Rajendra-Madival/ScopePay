import { useState, type FormEvent } from 'react'
import type { Milestone, MilestoneDraft, Project } from '../types'
import { Icon } from './Icon'
import { Button, PageHeading, ProjectStatusBadge, StatusBadge } from './Primitives'
import { formatDate, formatMoney } from '../utils/format'
import { PayPalCheckoutButton } from './PayPalCheckoutButton'
import { ApiError } from '../lib/api'

const fieldClass = 'mt-1.5 block w-full rounded-xl border border-stone-200 bg-white px-3.5 py-2.5 text-sm text-stone-800 outline-none transition placeholder:text-stone-400 focus:border-forest-500 focus:ring-4 focus:ring-forest-100'

function MilestoneDialog({
  milestone,
  onClose,
  onSave,
}: {
  milestone?: Milestone
  onClose: () => void
  onSave: (draft: MilestoneDraft) => Promise<void>
}) {
  const [title, setTitle] = useState(milestone?.title ?? '')
  const [description, setDescription] = useState(milestone?.description ?? '')
  const [amount, setAmount] = useState(milestone ? (milestone.amountCents / 100).toFixed(2) : '')
  const [dueDate, setDueDate] = useState(milestone?.dueDate ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      await onSave({
        title: title.trim(),
        description: description.trim(),
        amountCents: Math.round(Number(amount) * 100),
        dueDate,
        status: milestone?.status ?? 'pending',
      })
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'The milestone could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div aria-labelledby="milestone-dialog-title" aria-modal="true" className="fixed inset-0 z-50 flex items-end justify-center bg-stone-950/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-5" role="dialog">
      <form className="w-full max-w-lg rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-2xl sm:p-7" onSubmit={submit}>
        <div className="mb-5 flex items-start justify-between gap-4">
          <div><p className="text-xs font-bold uppercase tracking-[0.12em] text-forest-700">Project milestone</p><h2 className="mt-1 text-xl font-semibold text-stone-900" id="milestone-dialog-title">{milestone ? 'Edit milestone' : 'Add a milestone'}</h2><p className="mt-1 text-sm text-stone-500">Organize the work and its planned payment.</p></div>
          <button aria-label="Close dialog" className="rounded-lg p-2 text-stone-400 hover:bg-stone-100 hover:text-stone-700" onClick={onClose} type="button"><Icon className="size-5" name="x" /></button>
        </div>
        <div className="space-y-4">
          {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">{error}</p>}
          <label className="block text-sm font-medium text-stone-700">Milestone name <span className="text-rose-500">*</span><input autoFocus className={fieldClass} maxLength={100} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Initial design review" required value={title} /></label>
          <label className="block text-sm font-medium text-stone-700">Description <textarea className={`${fieldClass} min-h-20 resize-y`} maxLength={500} onChange={(event) => setDescription(event.target.value)} placeholder="What will be delivered for this milestone?" value={description} /></label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium text-stone-700">Planned amount <span className="text-rose-500">*</span><span className="relative mt-1.5 block"><span className="absolute inset-y-0 left-3.5 flex items-center text-sm text-stone-400">$</span><input className={`${fieldClass} mt-0 pl-8`} min="0.01" onChange={(event) => setAmount(event.target.value)} placeholder="0.00" required step="0.01" type="number" value={amount} /></span></label>
            <label className="block text-sm font-medium text-stone-700">Target date <span className="text-rose-500">*</span><input className={fieldClass} onChange={(event) => setDueDate(event.target.value)} required type="date" value={dueDate} /></label>
          </div>
        </div>
        <div className="mt-6 flex flex-col-reverse justify-end gap-2 border-t border-stone-100 pt-5 sm:flex-row">
          <Button disabled={saving} type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={saving} type="submit">{saving ? 'Saving…' : milestone ? 'Save changes' : 'Add milestone'}</Button>
        </div>
      </form>
    </div>
  )
}

export function ProjectDetails({
  project,
  onBack,
  onAddMilestone,
  onEditMilestone,
  onDeleteMilestone,
  onPaymentConfirmed,
  paypalConfigured,
}: {
  project: Project
  onBack: () => void
  onAddMilestone: (draft: MilestoneDraft) => Promise<void>
  onEditMilestone: (id: string, draft: MilestoneDraft) => Promise<void>
  onDeleteMilestone: (id: string) => Promise<void>
  onPaymentConfirmed: () => Promise<void>
  paypalConfigured: boolean
}) {
  const [dialog, setDialog] = useState<{ open: boolean; milestone?: Milestone }>({ open: false })
  const [error, setError] = useState('')
  const collected = project.milestones.filter((item) => item.status === 'paid').reduce((sum, item) => sum + item.amountCents, 0)
  const remaining = project.milestones.filter((item) => item.status === 'pending').reduce((sum, item) => sum + item.amountCents, 0)

  async function saveMilestone(draft: MilestoneDraft) {
    if (dialog.milestone) await onEditMilestone(dialog.milestone.id, draft)
    else await onAddMilestone(draft)
    setDialog({ open: false })
  }

  return (
    <>
      <button className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-stone-500 transition hover:text-stone-800" onClick={onBack}><Icon className="size-4" name="arrow-left" /> Back to projects</button>
      <PageHeading
        eyebrow="Project details"
        title={project.title}
        description={`Created ${formatDate(project.createdAt)} · Project with ${project.clientName}`}
        action={<ProjectStatusBadge completed={project.status === 'completed'} />}
      />
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_310px]">
        <div className="space-y-5">
          <section className="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(27,39,30,0.03)] sm:p-6">
            <div className="flex items-center gap-3 border-b border-stone-100 pb-4">
              <span className="flex size-9 items-center justify-center rounded-xl bg-[#edf3ee] text-forest-800"><Icon className="size-[18px]" name="briefcase" /></span>
              <h2 className="text-sm font-semibold text-stone-900">Project overview</h2>
            </div>
            <div className="grid gap-5 py-5 sm:grid-cols-2">
              <div><p className="text-xs font-medium text-stone-400">Client</p><p className="mt-1.5 text-sm font-semibold text-stone-800">{project.clientName}</p><a className="mt-1 inline-flex items-center gap-1.5 text-sm text-stone-500 hover:text-forest-700" href={`mailto:${project.clientEmail}`}><Icon className="size-3.5" name="mail" />{project.clientEmail}</a></div>
              <div><p className="text-xs font-medium text-stone-400">Total project budget</p><p className="mt-1.5 text-lg font-semibold tracking-tight text-stone-900">{formatMoney(project.budgetCents)}</p></div>
            </div>
            <div className="border-t border-stone-100 pt-4"><p className="text-xs font-medium text-stone-400">Project brief</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-stone-600">{project.brief}</p></div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-[0_1px_2px_rgba(27,39,30,0.03)]">
            <div className="flex flex-col gap-3 border-b border-stone-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <div><h2 className="text-base font-semibold text-stone-900">Milestones</h2><p className="mt-0.5 text-xs text-stone-500">{project.milestones.length} planned project milestones</p></div>
              <Button icon="plus" onClick={() => setDialog({ open: true })}>Add milestone</Button>
            </div>
            {error && <p className="mx-5 mt-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700 sm:mx-6" role="alert">{error}</p>}
            {project.milestones.length === 0 ? (
              <div className="px-5 py-12 text-center">
                <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-2xl bg-stone-50 text-stone-400"><Icon className="size-5" name="layers" /></div>
                <h3 className="text-sm font-semibold text-stone-800">No milestones yet</h3>
                <p className="mx-auto mt-1 max-w-xs text-sm text-stone-500">Add a milestone to break this project into clear, reviewable steps.</p>
                <Button className="mt-4" icon="plus" onClick={() => setDialog({ open: true })}>Add first milestone</Button>
              </div>
            ) : (
              <div className="divide-y divide-stone-100">
                {project.milestones.map((milestone, index) => (
                  <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:gap-4 sm:px-6" key={milestone.id}>
                    <span className={`flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${milestone.status === 'paid' ? 'bg-emerald-50 text-emerald-700' : 'bg-stone-100 text-stone-500'}`}>{milestone.status === 'paid' ? <Icon className="size-4" name="check" /> : String(index + 1).padStart(2, '0')}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1"><h3 className="text-sm font-semibold text-stone-800">{milestone.title}</h3><StatusBadge paid={milestone.status === 'paid'} /></div>
                      <p className="mt-1 text-xs leading-5 text-stone-500">{milestone.description || 'No description provided.'}</p>
                      <p className="mt-1.5 flex items-center gap-1.5 text-xs text-stone-400"><Icon className="size-3.5" name="calendar" />Target {formatDate(milestone.dueDate)}</p>
                      {milestone.status === 'pending' && paypalConfigured && (
                        <PayPalCheckoutButton
                          key={milestone.id}
                          milestoneId={milestone.id}
                          onPaymentConfirmed={onPaymentConfirmed}
                        />
                      )}
                      {milestone.status === 'pending' && !paypalConfigured && (
                        <p className="mt-2 text-xs text-stone-400">Add the public PayPal client ID to enable checkout.</p>
                      )}
                    </div>
                    <div className="flex items-center justify-between border-t border-stone-100 pt-3 sm:border-0 sm:pt-0">
                      <span className="text-sm font-semibold text-stone-800 sm:mr-3">{formatMoney(milestone.amountCents)}</span>
                      <div className="flex items-center gap-1">
                        {milestone.status === 'pending' && (
                          <>
                            <button aria-label={`Edit ${milestone.title}`} className="rounded-lg p-2 text-stone-400 hover:bg-stone-100 hover:text-stone-700" onClick={() => setDialog({ open: true, milestone })}><Icon className="size-4" name="edit" /></button>
                            <button aria-label={`Delete ${milestone.title}`} className="rounded-lg p-2 text-stone-400 hover:bg-rose-50 hover:text-rose-600" onClick={async () => {
                              setError('')
                              try {
                                await onDeleteMilestone(milestone.id)
                              } catch (cause) {
                                setError(cause instanceof ApiError ? cause.message : 'The milestone could not be deleted.')
                              }
                            }}><Icon className="size-4" name="trash" /></button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-4">
          <section className="rounded-2xl bg-forest-800 p-5 text-white shadow-sm">
            <p className="text-xs font-medium text-emerald-100/70">Project budget</p>
            <p className="mt-2 text-[30px] font-semibold tracking-tight">{formatMoney(project.budgetCents)}</p>
            <div className="mt-5 h-px bg-white/15" />
            <div className="mt-4 flex justify-between text-sm"><span className="text-emerald-100/75">Paid</span><span className="font-semibold">{formatMoney(collected)}</span></div>
            <div className="mt-3 flex justify-between text-sm"><span className="text-emerald-100/75">Pending</span><span className="font-semibold">{formatMoney(remaining)}</span></div>
            <p className="mt-4 rounded-lg bg-white/10 px-3 py-2 text-xs leading-5 text-emerald-50/80">A milestone is marked paid only after the backend verifies PayPal’s capture response.</p>
          </section>
          <section className="rounded-2xl border border-stone-200/80 bg-white p-5">
            <h2 className="text-sm font-semibold text-stone-800">Payment status</h2>
            <div className="mt-4 flex items-center justify-between border-b border-stone-100 pb-3 text-sm"><span className="text-stone-500">Paid milestones</span><span className="font-semibold text-stone-800">{project.milestones.filter((item) => item.status === 'paid').length}</span></div>
            <div className="flex items-center justify-between pt-3 text-sm"><span className="text-stone-500">Awaiting payment</span><span className="font-semibold text-stone-800">{project.milestones.filter((item) => item.status === 'pending').length}</span></div>
            <p className="mt-4 text-xs leading-5 text-stone-400">Payment status is stored in the database. PayPal checkout is not escrow or payment protection.</p>
          </section>
        </aside>
      </div>
      {dialog.open && <MilestoneDialog key={dialog.milestone?.id ?? 'new'} milestone={dialog.milestone} onClose={() => setDialog({ open: false })} onSave={saveMilestone} />}
    </>
  )
}
