import { useEffect, useState, type FormEvent } from 'react'
import type { Milestone, MilestoneDraft, Project, ScopeAnalysis, ScopeChange, ScopeChangeDraft } from '../types'
import { Icon } from './Icon'
import { Button, PageHeading, ProjectStatusBadge, ScopeStatusBadge, StatusBadge } from './Primitives'
import { formatDate, formatMoney } from '../utils/format'
import { PayPalCheckoutButton } from './PayPalCheckoutButton'
import { analyzeScopeChange, ApiError, createScopeChange, deleteScopeChange, updateScopeChange } from '../lib/api'

const fieldClass = 'mt-1.5 block w-full rounded-xl border border-stone-200 bg-white px-3.5 py-2.5 text-sm text-stone-800 outline-none transition placeholder:text-stone-400 focus:border-forest-500 focus:ring-4 focus:ring-forest-100'

function ScopeChangeDialog({
  projectId,
  change,
  onClose,
  onSave,
}: {
  projectId: string
  change?: ScopeChange
  onClose: () => void
  onSave: (draft: ScopeChangeDraft) => Promise<void>
}) {
  const [originalRequirement, setOriginalRequirement] = useState(change?.originalRequirement ?? '')
  const [newRequirement, setNewRequirement] = useState(change?.newRequirement ?? '')
  const [status, setStatus] = useState<ScopeChange['status']>(change?.status ?? 'PENDING')
  const [saving, setSaving] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [analysis, setAnalysis] = useState<ScopeAnalysis | null>(change?.aiAnalysis ?? null)
  const [error, setError] = useState('')

  async function runAnalysis() {
    setAnalyzing(true)
    setAnalysis(null)
    setError('')
    try {
      const result = await analyzeScopeChange(projectId, {
        originalRequirement: originalRequirement.trim(),
        newRequirement: newRequirement.trim(),
      })
      setAnalysis(result)
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'AI scope analysis could not be completed.')
    } finally {
      setAnalyzing(false)
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      await onSave({
        originalRequirement: originalRequirement.trim(),
        newRequirement: newRequirement.trim(),
        aiAnalysis: analysis,
        status,
      })
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'The scope change could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div aria-labelledby="scope-dialog-title" aria-modal="true" className="fixed inset-0 z-50 flex items-end justify-center bg-stone-950/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-5" role="dialog">
      <form className="w-full max-w-xl rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-2xl sm:p-7" onSubmit={submit}>
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-forest-700">Scope request</p>
            <h2 className="mt-1 text-xl font-semibold text-stone-900" id="scope-dialog-title">{change ? 'Review scope change' : 'Add a scope change'}</h2>
            <p className="mt-1 text-sm text-stone-500">Capture the original requirement and the revised expectation.</p>
          </div>
          <button aria-label="Close dialog" className="rounded-lg p-2 text-stone-400 hover:bg-stone-100 hover:text-stone-700 disabled:opacity-50" disabled={saving || analyzing} onClick={onClose} type="button"><Icon className="size-5" name="x" /></button>
        </div>

        <div className="space-y-4">
          {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">{error}</p>}

          <label className="block text-sm font-medium text-stone-700">Original requirement <textarea className={`${fieldClass} min-h-28 resize-y`} maxLength={5000} onChange={(event) => { setOriginalRequirement(event.target.value); setAnalysis(null) }} placeholder="What was originally agreed?" required value={originalRequirement} /></label>
          <label className="block text-sm font-medium text-stone-700">Updated requirement <textarea className={`${fieldClass} min-h-28 resize-y`} maxLength={5000} onChange={(event) => { setNewRequirement(event.target.value); setAnalysis(null) }} placeholder="What changes are requested?" required value={newRequirement} /></label>

          <div className="rounded-xl border border-[#dce9df] bg-[#f5f8f5] p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-stone-800">AI scope impact</p>
                <p className="mt-1 text-xs leading-5 text-stone-500">The two requirement texts are sent to OpenAI. Review its suggestions; they are not estimates or approvals.</p>
              </div>
              <Button
                disabled={saving || analyzing || !originalRequirement.trim() || !newRequirement.trim()}
                onClick={() => { void runAnalysis() }}
                type="button"
                variant="secondary"
              >
                {analyzing ? 'Analyzing…' : 'Analyze impact'}
              </Button>
            </div>
            {analysis && (
              <div aria-live="polite" className="mt-4 space-y-3 border-t border-[#dce9df] pt-4" role="status">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-stone-800">Impact: {analysis.impact.toLowerCase()}</p>
                  <span className="text-xs text-stone-400">AI-generated; confirm with your client</span>
                </div>
                <p className="text-sm leading-6 text-stone-600">{analysis.summary}</p>
                {analysis.addedWork.length > 0 && <AnalysisList title="Potential added work" items={analysis.addedWork} />}
                {analysis.risks.length > 0 && <AnalysisList title="Risks to clarify" items={analysis.risks} />}
                {analysis.clarificationQuestions.length > 0 && <AnalysisList title="Questions for the client" items={analysis.clarificationQuestions} />}
              </div>
            )}
          </div>

          <label className="block text-sm font-medium text-stone-700">Review status
            <select className={fieldClass} onChange={(event) => setStatus(event.target.value as ScopeChange['status'])} value={status}>
              <option value="PENDING">Pending</option>
              <option value="REVIEWED">Reviewed</option>
              <option value="ACCEPTED">Accepted</option>
              <option value="REJECTED">Rejected</option>
            </select>
          </label>
        </div>

        <div className="mt-6 flex flex-col-reverse justify-end gap-2 border-t border-stone-100 pt-5 sm:flex-row">
          <Button disabled={saving || analyzing} type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={saving || analyzing} type="submit">{saving ? 'Saving…' : change ? 'Save review' : 'Add request'}</Button>
        </div>
      </form>
    </div>
  )
}

function AnalysisList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="text-xs font-semibold text-stone-700">{title}</p>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-xs leading-5 text-stone-600">
        {items.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}
      </ul>
    </div>
  )
}

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
        deliverables: milestone?.deliverables ?? [],
        estimatedDays: milestone?.estimatedDays ?? null,
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
  const [scopeDialog, setScopeDialog] = useState<{ open: boolean; change?: ScopeChange }>({ open: false })
  const [scopeChanges, setScopeChanges] = useState(project.scopeChanges)
  const [error, setError] = useState('')
  const collected = project.milestones.filter((item) => item.status === 'paid').reduce((sum, item) => sum + item.amountCents, 0)
  const remaining = project.milestones.filter((item) => item.status === 'pending').reduce((sum, item) => sum + item.amountCents, 0)

  useEffect(() => {
    setScopeChanges(project.scopeChanges)
  }, [project.scopeChanges])

  async function saveMilestone(draft: MilestoneDraft) {
    if (dialog.milestone) await onEditMilestone(dialog.milestone.id, draft)
    else await onAddMilestone(draft)
    setDialog({ open: false })
  }

  async function saveScopeChange(draft: ScopeChangeDraft) {
    if (scopeDialog.change) {
      const updated = await updateScopeChange(scopeDialog.change.id, draft)
      setScopeChanges((current) => current.map((item) => item.id === updated.id ? updated : item))
    } else {
      const created = await createScopeChange(project.id, draft)
      setScopeChanges((current) => [created, ...current])
    }
    setScopeDialog({ open: false })
  }

  async function approveScopeChange(changeId: string, status: ScopeChange['status']) {
    const updated = await updateScopeChange(changeId, { status })
    setScopeChanges((current) => current.map((item) => item.id === updated.id ? updated : item))
  }

  async function removeScopeChange(changeId: string) {
    await deleteScopeChange(changeId)
    setScopeChanges((current) => current.filter((item) => item.id !== changeId))
  }

  return (
    <>
      <button className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-stone-500 transition hover:text-stone-800" onClick={onBack}><Icon className="size-4" name="arrow-left" /> Back to projects</button>
      <PageHeading
        eyebrow="Project details"
        title={project.title}
        description={`Created ${formatDate(project.createdAt)} · Project with ${project.clientName || 'client'}`}
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
              <div><p className="text-xs font-medium text-stone-400">Client</p><p className="mt-1.5 text-sm font-semibold text-stone-800">{project.clientName || 'Not specified'}</p>{project.clientEmail && <a className="mt-1 inline-flex items-center gap-1.5 text-sm text-stone-500 hover:text-forest-700" href={`mailto:${project.clientEmail}`}><Icon className="size-3.5" name="mail" />{project.clientEmail}</a>}</div>
              <div><p className="text-xs font-medium text-stone-400">Total project budget</p><p className="mt-1.5 text-lg font-semibold tracking-tight text-stone-900">{formatMoney(project.budgetCents, project.currency)}</p></div>
            </div>
            {project.deadline && <div className="border-t border-stone-100 py-4"><p className="text-xs font-medium text-stone-400">Deadline or expected timeframe</p><p className="mt-1.5 text-sm font-semibold text-stone-800">{project.deadline}</p></div>}
            <div className="border-t border-stone-100 pt-4"><p className="text-xs font-medium text-stone-400">Project brief</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-stone-600">{project.brief}</p></div>
          </section>

          {project.plan && (
            <section className="rounded-2xl border border-[#dce9df] bg-white p-5 shadow-[0_1px_2px_rgba(27,39,30,0.03)] sm:p-6">
              <div className="flex items-center justify-between gap-3 border-b border-stone-100 pb-4">
                <div><h2 className="text-base font-semibold text-stone-900">Approved project plan</h2><p className="mt-1 text-xs text-stone-500">Editable suggestions reviewed before saving</p></div>
                <span className="rounded-full bg-forest-50 px-3 py-1 text-xs font-semibold text-forest-700">{project.plan.estimatedDurationDays} days</span>
              </div>
              <p className="py-4 text-sm leading-6 text-stone-600">{project.plan.summary}</p>
              <div className="grid gap-4 border-t border-stone-100 pt-4 sm:grid-cols-2">
                <AnalysisList title="Requirements" items={project.plan.requirements} />
                {project.plan.assumptions.length > 0 && <AnalysisList title="Assumptions" items={project.plan.assumptions} />}
                {project.plan.risks.length > 0 && <AnalysisList title="Risks" items={project.plan.risks} />}
                {project.plan.missingInformation.length > 0 && <AnalysisList title="Missing information" items={project.plan.missingInformation} />}
                {project.plan.clientQuestions.length > 0 && <AnalysisList title="Questions for the client" items={project.plan.clientQuestions} />}
              </div>
            </section>
          )}

          <section className="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(27,39,30,0.03)] sm:p-6">
            <div className="flex items-center justify-between gap-3 border-b border-stone-100 pb-4">
              <div>
                <h2 className="text-base font-semibold text-stone-900">Scope changes</h2>
                <p className="mt-0.5 text-xs text-stone-500">Track client revisions and approvals before they hit production.</p>
              </div>
              <Button icon="plus" onClick={() => setScopeDialog({ open: true })}>New request</Button>
            </div>

            {scopeChanges.length === 0 ? (
              <div className="px-1 py-6 text-center">
                <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-2xl bg-stone-50 text-stone-400"><Icon className="size-5" name="layers" /></div>
                <h3 className="text-sm font-semibold text-stone-800">No scope revisions yet</h3>
                <p className="mx-auto mt-1 max-w-md text-sm text-stone-500">Capture a change request whenever the client asks for a new deliverable or a tighter revision.</p>
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                {scopeChanges.map((change) => (
                  <div className="rounded-2xl border border-stone-200 bg-stone-50/50 p-4" key={change.id}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-400">Scope revision</p>
                        <p className="mt-1 text-sm font-semibold text-stone-800">{formatDate(change.createdAt)}</p>
                      </div>
                      <ScopeStatusBadge status={change.status} />
                    </div>

                    <div className="mt-4 grid gap-4 lg:grid-cols-2">
                      <div className="rounded-xl border border-stone-200 bg-white p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-400">Original requirement</p>
                        <p className="mt-2 text-sm leading-6 text-stone-600">{change.originalRequirement || 'No original requirement recorded.'}</p>
                      </div>
                      <div className="rounded-xl border border-stone-200 bg-white p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-400">Updated requirement</p>
                        <p className="mt-2 text-sm leading-6 text-stone-600">{change.newRequirement || 'No updated requirement recorded.'}</p>
                      </div>
                    </div>

                    {change.aiAnalysis && (
                      <div className="mt-4 rounded-xl border border-[#dce9df] bg-[#f5f8f5] p-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-forest-700">AI scope impact · {change.aiAnalysis.impact.toLowerCase()}</p>
                        <p className="mt-2 text-sm leading-6 text-stone-600">{change.aiAnalysis.summary}</p>
                        {change.aiAnalysis.addedWork.length > 0 && <AnalysisList title="Potential added work" items={change.aiAnalysis.addedWork} />}
                        {change.aiAnalysis.risks.length > 0 && <AnalysisList title="Risks to clarify" items={change.aiAnalysis.risks} />}
                        {change.aiAnalysis.clarificationQuestions.length > 0 && <AnalysisList title="Questions for the client" items={change.aiAnalysis.clarificationQuestions} />}
                      </div>
                    )}

                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <Button className="px-3 py-2" type="button" variant="secondary" onClick={() => setScopeDialog({ open: true, change })}>Edit</Button>
                      <Button className="px-3 py-2" type="button" variant="secondary" onClick={() => approveScopeChange(change.id, 'REVIEWED')}>Mark reviewed</Button>
                      <Button className="px-3 py-2" type="button" onClick={() => approveScopeChange(change.id, 'ACCEPTED')}>Accept</Button>
                      <Button className="px-3 py-2" type="button" variant="danger" onClick={() => approveScopeChange(change.id, 'REJECTED')}>Reject</Button>
                      <button className="ml-auto inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-50" onClick={() => removeScopeChange(change.id)} type="button"><Icon className="size-3.5" name="trash" />Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
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
                      <p className="mt-1.5 flex items-center gap-1.5 text-xs text-stone-400"><Icon className="size-3.5" name="calendar" />{milestone.estimatedDays !== null ? `Estimated ${milestone.estimatedDays} days` : `Target ${formatDate(milestone.dueDate)}`}</p>
                      {milestone.deliverables.length > 0 && (
                        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5 text-stone-500">
                          {milestone.deliverables.map((deliverable, deliverableIndex) => <li key={`${milestone.id}-${deliverableIndex}`}>{deliverable}</li>)}
                        </ul>
                      )}
                      {milestone.status === 'pending' && paypalConfigured && project.currency === 'USD' && (
                        <PayPalCheckoutButton
                          key={milestone.id}
                          milestoneId={milestone.id}
                          onPaymentConfirmed={onPaymentConfirmed}
                        />
                      )}
                      {milestone.status === 'pending' && (!paypalConfigured || project.currency !== 'USD') && (
                        <p className="mt-2 text-xs text-stone-400">
                          {!paypalConfigured
                            ? 'Add the public PayPal client ID to enable checkout.'
                            : 'PayPal checkout is currently configured for USD projects only.'}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center justify-between border-t border-stone-100 pt-3 sm:border-0 sm:pt-0">
                      <span className="text-sm font-semibold text-stone-800 sm:mr-3">{formatMoney(milestone.amountCents, project.currency)}</span>
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
            <p className="mt-2 text-[30px] font-semibold tracking-tight">{formatMoney(project.budgetCents, project.currency)}</p>
            <div className="mt-5 h-px bg-white/15" />
            <div className="mt-4 flex justify-between text-sm"><span className="text-emerald-100/75">Paid</span><span className="font-semibold">{formatMoney(collected, project.currency)}</span></div>
            <div className="mt-3 flex justify-between text-sm"><span className="text-emerald-100/75">Pending</span><span className="font-semibold">{formatMoney(remaining, project.currency)}</span></div>
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
      {scopeDialog.open && <ScopeChangeDialog projectId={project.id} change={scopeDialog.change} onClose={() => setScopeDialog({ open: false })} onSave={saveScopeChange} />}
      {dialog.open && <MilestoneDialog key={dialog.milestone?.id ?? 'new'} milestone={dialog.milestone} onClose={() => setDialog({ open: false })} onSave={saveMilestone} />}
    </>
  )
}
