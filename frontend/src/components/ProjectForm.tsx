import { useState, type FormEvent } from 'react'
import type { ProjectDraft } from '../types'
import { Icon } from './Icon'
import { Button, PageHeading } from './Primitives'
import { ApiError } from '../lib/api'

const inputClass = 'mt-1.5 block w-full rounded-xl border border-stone-200 bg-white px-3.5 py-2.5 text-sm text-stone-800 outline-none transition placeholder:text-stone-400 focus:border-forest-500 focus:ring-4 focus:ring-forest-100'

export function ProjectForm({
  onCancel,
  onSave,
}: {
  onCancel: () => void
  onSave: (project: ProjectDraft) => Promise<void>
}) {
  const [title, setTitle] = useState('')
  const [clientName, setClientName] = useState('')
  const [clientEmail, setClientEmail] = useState('')
  const [brief, setBrief] = useState('')
  const [budget, setBudget] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      await onSave({
        title: title.trim(),
        clientName: clientName.trim(),
        clientEmail: clientEmail.trim(),
        brief: brief.trim(),
        budgetCents: Math.round(Number(budget) * 100),
        status: 'in progress',
      })
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'The project could not be created.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <button className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-stone-500 transition hover:text-stone-800" onClick={onCancel}>
        <Icon className="size-4" name="arrow-left" /> Back to projects
      </button>
      <PageHeading eyebrow="Project setup" title="Create a project" description="Capture the essentials. You can refine the scope and milestones as the project takes shape." />
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <form className="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(27,39,30,0.03)] sm:p-7" onSubmit={handleSubmit}>
          <div className="mb-6 flex items-center gap-3 border-b border-stone-100 pb-5">
            <span className="flex size-10 items-center justify-center rounded-xl bg-forest-50 text-forest-700"><Icon className="size-[19px]" name="file" /></span>
            <div><h2 className="text-sm font-semibold text-stone-900">Project details</h2><p className="mt-0.5 text-xs text-stone-500">Add the client and project information</p></div>
          </div>
          {error && <p className="mb-5 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">{error}</p>}
          <div className="space-y-5">
            <label className="block text-sm font-medium text-stone-700">Project title <span className="text-rose-500">*</span>
              <input autoFocus className={inputClass} maxLength={100} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Brand identity and website" required value={title} />
            </label>
            <div className="grid gap-5 sm:grid-cols-2">
              <label className="block text-sm font-medium text-stone-700">Client name <span className="text-rose-500">*</span>
                <input className={inputClass} maxLength={100} onChange={(event) => setClientName(event.target.value)} placeholder="e.g. Acme Studio" required value={clientName} />
              </label>
              <label className="block text-sm font-medium text-stone-700">Client email <span className="text-rose-500">*</span>
                <input autoComplete="email" className={inputClass} onChange={(event) => setClientEmail(event.target.value)} placeholder="name@company.com" required type="email" value={clientEmail} />
              </label>
            </div>
            <label className="block text-sm font-medium text-stone-700">Project brief <span className="text-rose-500">*</span>
              <textarea className={`${inputClass} min-h-32 resize-y leading-6`} maxLength={2000} onChange={(event) => setBrief(event.target.value)} placeholder="What are you building together? Include goals, deliverables, and any important context." required value={brief} />
              <span className="mt-1 block text-right text-xs font-normal text-stone-400">{brief.length}/2,000</span>
            </label>
            <label className="block max-w-[260px] text-sm font-medium text-stone-700">Total project budget <span className="text-rose-500">*</span>
              <span className="relative mt-1.5 block">
                <span className="absolute inset-y-0 left-3.5 flex items-center text-sm text-stone-400">$</span>
                <input className={`${inputClass} mt-0 pl-8`} min="0.01" onChange={(event) => setBudget(event.target.value)} placeholder="0.00" required step="0.01" type="number" value={budget} />
              </span>
              <span className="mt-1.5 block text-xs font-normal text-stone-400">Enter the agreed project budget. Payments are not collected here.</span>
            </label>
          </div>
          <div className="mt-7 flex flex-col-reverse justify-end gap-2 border-t border-stone-100 pt-5 sm:flex-row">
            <Button disabled={saving} type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
            <Button disabled={saving} icon="arrow-right" type="submit">{saving ? 'Creating…' : 'Create project'}</Button>
          </div>
        </form>

        <aside className="rounded-2xl border border-[#dce9df] bg-[#eff5f0] p-5">
          <div className="flex size-9 items-center justify-center rounded-xl bg-white text-forest-700"><Icon className="size-[18px]" name="sparkle" /></div>
          <h2 className="mt-4 text-sm font-semibold text-forest-900">A clear scope starts here</h2>
          <p className="mt-1.5 text-sm leading-6 text-forest-800/75">Capture what you know today. Add and organize project milestones from the project details page.</p>
          <div className="mt-5 space-y-3 border-t border-forest-900/10 pt-4 text-xs leading-5 text-forest-800/80">
            <p className="flex gap-2"><Icon className="mt-0.5 size-4 shrink-0" name="check" /> Keep the brief focused on agreed outcomes.</p>
            <p className="flex gap-2"><Icon className="mt-0.5 size-4 shrink-0" name="check" /> Break the work into reviewable milestones.</p>
          </div>
        </aside>
      </div>
    </>
  )
}
