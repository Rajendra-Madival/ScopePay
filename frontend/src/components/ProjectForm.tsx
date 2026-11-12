import { useState, type FormEvent } from 'react'
import type { ProjectDraft } from '../types'
import { analyzeProject, ApiError } from '../lib/api'
import type { GeneratedProjectPlan } from '../lib/api'
import { Icon } from './Icon'
import { Button, PageHeading } from './Primitives'

const inputClass = 'mt-1.5 block w-full rounded-xl border border-stone-200 bg-white px-3.5 py-2.5 text-sm text-stone-800 outline-none transition placeholder:text-stone-400 focus:border-forest-500 focus:ring-4 focus:ring-forest-100'
const currencies = ['USD', 'EUR', 'GBP', 'CAD', 'AUD'] as const
type ProjectCurrency = (typeof currencies)[number]

type EditableMilestone = {
  title: string
  description: string
  deliverablesText: string
  estimatedDays: string
  suggestedAmount: string
}

type EditablePlan = {
  summary: string
  requirementsText: string
  assumptionsText: string
  risksText: string
  missingInformationText: string
  clientQuestionsText: string
  milestones: EditableMilestone[]
}

function listText(items: string[]) {
  return items.join('\n')
}

function parseList(value: string) {
  return value.split('\n').map((item) => item.trim()).filter(Boolean)
}

function toEditablePlan(result: GeneratedProjectPlan): EditablePlan {
  return {
    summary: result.summary,
    requirementsText: listText(result.requirements),
    assumptionsText: listText(result.assumptions),
    risksText: listText(result.risks),
    missingInformationText: listText(result.missingInformation),
    clientQuestionsText: listText(result.clientQuestions),
    milestones: result.milestones.map((milestone) => ({
      title: milestone.title,
      description: milestone.description,
      deliverablesText: listText(milestone.deliverables),
      estimatedDays: String(milestone.estimatedDays),
      suggestedAmount: milestone.suggestedAmount.toFixed(2),
    })),
  }
}

function ListEditor({
  label,
  value,
  onChange,
  rows = 3,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  rows?: number
}) {
  return (
    <label className="block text-sm font-medium text-stone-700">
      {label}
      <textarea
        className={`${inputClass} resize-y leading-6`}
        onChange={(event) => onChange(event.target.value)}
        placeholder="One item per line"
        rows={rows}
        value={value}
      />
      <span className="mt-1 block text-xs font-normal text-stone-400">Enter one item per line.</span>
    </label>
  )
}

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
  const [currency, setCurrency] = useState<ProjectCurrency | ''>('')
  const [deadline, setDeadline] = useState('')
  const [plan, setPlan] = useState<EditablePlan | null>(null)
  const [generatedFor, setGeneratedFor] = useState('')
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')

  const requestFingerprint = JSON.stringify([brief.trim(), Number(budget), currency, deadline.trim()])
  const planIsCurrent = plan !== null && generatedFor === requestFingerprint
  const budgetCents = Math.round(Number(budget) * 100)
  const milestoneCents = plan?.milestones.map((milestone) => Number(milestone.suggestedAmount) * 100) ?? []
  const hasValidMilestoneAmounts = milestoneCents.length > 0 &&
    milestoneCents.every((amount) =>
      Number.isFinite(amount) && amount >= 1 && Math.abs(amount - Math.round(amount)) < 0.00001,
    )
  const milestoneTotal = hasValidMilestoneAmounts
    ? milestoneCents.reduce((total, amount) => total + Math.round(amount), 0)
    : 0
  const planMatchesBudget = hasValidMilestoneAmounts &&
    Number.isFinite(budgetCents) &&
    Math.abs(Number(budget) * 100 - budgetCents) < 0.00001 &&
    milestoneTotal === budgetCents

  async function generatePlan() {
    setError('')
    if (!brief.trim()) {
      setError('Enter a project brief before generating a plan.')
      return
    }
    if (budget.trim() && (!Number.isFinite(Number(budget)) || budgetCents < 1 ||
      Math.abs(Number(budget) * 100 - budgetCents) >= 0.00001)) {
      setError('Enter a valid budget with no more than two decimal places.')
      return
    }

    setGenerating(true)
    try {
      const result = await analyzeProject({
        description: brief.trim(),
        ...(budget.trim() ? { budget: Number(budget) } : {}),
        ...(currency ? { currency } : {}),
        ...(deadline.trim() ? { deadline: deadline.trim() } : {}),
      })
      setTitle(result.projectTitle)
      setClientName((current) => current || result.clientName)
      setClientEmail((current) => current || result.clientEmail)
      setBudget(result.totalEstimatedAmount.toFixed(2))
      setCurrency(result.currency)
      setDeadline(result.deadline)
      setPlan(toEditablePlan(result))
      setGeneratedFor(JSON.stringify([
        brief.trim(),
        result.totalEstimatedAmount,
        result.currency,
        result.deadline.trim(),
      ]))
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'The project plan could not be generated.')
    } finally {
      setGenerating(false)
    }
  }

  function updateMilestone(index: number, patch: Partial<EditableMilestone>) {
    setPlan((current) => current && ({
      ...current,
      milestones: current.milestones.map((milestone, milestoneIndex) =>
        milestoneIndex === index ? { ...milestone, ...patch } : milestone,
      ),
    }))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      if (!Number.isFinite(Number(budget)) || budgetCents < 1 ||
        Math.abs(Number(budget) * 100 - budgetCents) >= 0.00001) {
        throw new Error('Enter a valid project budget before creating the project.')
      }
      if (plan && !planIsCurrent) {
        throw new Error('The brief, budget, currency, or deadline changed. Regenerate the plan before approving it.')
      }
      if (plan && !planMatchesBudget) {
        throw new Error('Milestone suggestions must add up exactly to the project budget before approval.')
      }
      const draft: ProjectDraft = {
        title: title.trim(),
        clientName: clientName.trim(),
        clientEmail: clientEmail.trim(),
        brief: brief.trim(),
        budgetCents,
        currency,
        ...(deadline.trim() ? { deadline: deadline.trim() } : {}),
        ...(plan ? {
          plan: {
            summary: plan.summary.trim(),
            requirements: parseList(plan.requirementsText),
            assumptions: parseList(plan.assumptionsText),
            risks: parseList(plan.risksText),
            missingInformation: parseList(plan.missingInformationText),
            clientQuestions: parseList(plan.clientQuestionsText),
            estimatedDurationDays: plan.milestones.reduce(
              (total, milestone) => total + Number(milestone.estimatedDays),
              0,
            ),
          },
          milestones: plan.milestones.map((milestone) => ({
            title: milestone.title.trim(),
            description: milestone.description.trim(),
            deliverables: parseList(milestone.deliverablesText),
            estimatedDays: Number(milestone.estimatedDays),
            amountCents: Math.round(Number(milestone.suggestedAmount) * 100),
          })),
        } : {}),
      }
      await onSave(draft)
    } catch (cause) {
      setError(cause instanceof ApiError || cause instanceof Error
        ? cause.message
        : 'The project could not be created.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <button className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-stone-500 transition hover:text-stone-800" onClick={onCancel} type="button">
        <Icon className="size-4" name="arrow-left" /> Back to projects
      </button>
      <PageHeading eyebrow="Project setup" title="Create a project" description="Turn the client brief into a draft plan, review every detail, then approve it to save." />
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <form className="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(27,39,30,0.03)] sm:p-7" onSubmit={handleSubmit}>
          <div className="mb-6 flex items-center gap-3 border-b border-stone-100 pb-5">
            <span className="flex size-10 items-center justify-center rounded-xl bg-forest-50 text-forest-700"><Icon className="size-[19px]" name="file" /></span>
            <div><h2 className="text-sm font-semibold text-stone-900">Project details</h2><p className="mt-0.5 text-xs text-stone-500">Describe the project; client contact details are optional</p></div>
          </div>
          {error && <p className="mb-5 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">{error}</p>}
          <div className="space-y-5">
            <label className="block text-sm font-medium text-stone-700">Project title <span className="text-rose-500">*</span>
              <input autoFocus className={inputClass} maxLength={120} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Brand identity and website" required value={title} />
            </label>
            <div className="grid gap-5 sm:grid-cols-2">
              <label className="block text-sm font-medium text-stone-700">Client name <span className="font-normal text-stone-400">(optional)</span>
                <input className={inputClass} maxLength={120} onChange={(event) => setClientName(event.target.value)} placeholder="e.g. Acme Studio" value={clientName} />
              </label>
              <label className="block text-sm font-medium text-stone-700">Client email <span className="font-normal text-stone-400">(optional)</span>
                <input autoComplete="email" className={inputClass} onChange={(event) => setClientEmail(event.target.value)} placeholder="name@company.com" type="email" value={clientEmail} />
              </label>
            </div>
            <label className="block text-sm font-medium text-stone-700">Client project brief <span className="text-rose-500">*</span>
              <textarea className={`${inputClass} min-h-36 resize-y leading-6`} maxLength={10000} onChange={(event) => setBrief(event.target.value)} placeholder="Paste the client's project description, goals, deliverables, and important context." required value={brief} />
              <span className="mt-1 block text-xs font-normal text-stone-500">A complete brief is enough to generate a draft. Include any client contact details, budget, currency, and deadline you already know.</span>
              <span className="mt-1 block text-right text-xs font-normal text-stone-400">{brief.length}/10,000</span>
            </label>
            <div className="grid gap-5 sm:grid-cols-2">
              <label className="block text-sm font-medium text-stone-700">Budget <span className="font-normal text-stone-400">(optional; inferred or estimated from brief)</span>
                <span className="relative mt-1.5 block">
                  <span className="absolute inset-y-0 left-3.5 flex items-center text-sm text-stone-400">{currency || 'Auto'}</span>
                  <input className={`${inputClass} mt-0 pl-14`} max="21474836.47" min="0.01" onChange={(event) => setBudget(event.target.value)} placeholder="Leave blank to infer" step="0.01" type="number" value={budget} />
                </span>
              </label>
              <label className="block text-sm font-medium text-stone-700">Currency <span className="font-normal text-stone-400">(optional)</span>
                <select className={inputClass} onChange={(event) => setCurrency(event.target.value as ProjectCurrency | '')} value={currency}>
                  <option value="">Infer from brief</option>
                  {currencies.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
            </div>
            <label className="block text-sm font-medium text-stone-700">Deadline or expected timeframe <span className="font-normal text-stone-400">(optional)</span>
              <input className={inputClass} maxLength={120} onChange={(event) => setDeadline(event.target.value)} placeholder="Leave blank to infer from brief" value={deadline} />
            </label>
            <div className="rounded-2xl border border-[#dce9df] bg-[#f5f8f5] p-4 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-stone-900">AI project plan</h3>
                  <p className="mt-1 text-xs leading-5 text-stone-500">Generate the draft from the brief. Missing budget details become editable suggestions. Nothing is saved until you approve the plan.</p>
                </div>
                <Button disabled={generating || saving} icon="sparkle" onClick={() => { void generatePlan() }} type="button" variant="secondary">
                  {generating ? 'Generating…' : plan ? 'Regenerate plan' : 'Generate project plan'}
                </Button>
              </div>
              {generating && <p aria-live="polite" className="mt-3 text-xs text-forest-700" role="status">Gemini is preparing a structured draft…</p>}
              {plan && !planIsCurrent && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800" role="status">The brief, budget, currency, or deadline changed. Regenerate this plan before approval.</p>}
              {plan && (
                <div className="mt-5 space-y-5 border-t border-[#dce9df] pt-5">
                  <p className="text-xs leading-5 text-stone-500">AI-generated suggestions can be inaccurate. Review and edit the details before approving.</p>
                  <label className="block text-sm font-medium text-stone-700">Plan summary
                    <textarea className={`${inputClass} min-h-24 resize-y leading-6`} maxLength={3000} onChange={(event) => setPlan({ ...plan, summary: event.target.value })} required value={plan.summary} />
                  </label>
                  <ListEditor label="Requirements" onChange={(value) => setPlan({ ...plan, requirementsText: value })} value={plan.requirementsText} />
                  <ListEditor label="Assumptions" onChange={(value) => setPlan({ ...plan, assumptionsText: value })} value={plan.assumptionsText} />
                  <div className="space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <div><h4 className="text-sm font-semibold text-stone-800">Suggested milestones</h4><p className="mt-1 text-xs text-stone-500">Edit deliverables, duration, and suggested amounts.</p></div>
                      <Button disabled={plan.milestones.length >= 20} onClick={() => setPlan({
                        ...plan,
                        milestones: [...plan.milestones, { title: '', description: '', deliverablesText: '', estimatedDays: '1', suggestedAmount: '' }],
                      })} type="button" variant="secondary">Add milestone</Button>
                    </div>
                    {plan.milestones.map((milestone, index) => (
                      <article className="rounded-xl border border-stone-200 bg-white p-4" key={index}>
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <h5 className="text-sm font-semibold text-stone-800">Milestone {index + 1}</h5>
                          <button aria-label={`Delete milestone ${index + 1}`} className="rounded-lg p-2 text-stone-400 hover:bg-rose-50 hover:text-rose-600" disabled={plan.milestones.length <= 1} onClick={() => setPlan({
                            ...plan,
                            milestones: plan.milestones.filter((_, itemIndex) => itemIndex !== index),
                          })} type="button"><Icon className="size-4" name="trash" /></button>
                        </div>
                        <div className="space-y-3">
                          <label className="block text-sm font-medium text-stone-700">Title
                            <input className={inputClass} maxLength={120} onChange={(event) => updateMilestone(index, { title: event.target.value })} required value={milestone.title} />
                          </label>
                          <label className="block text-sm font-medium text-stone-700">Description
                            <textarea className={`${inputClass} min-h-20 resize-y`} maxLength={2000} onChange={(event) => updateMilestone(index, { description: event.target.value })} required value={milestone.description} />
                          </label>
                          <ListEditor label="Deliverables" onChange={(value) => updateMilestone(index, { deliverablesText: value })} value={milestone.deliverablesText} rows={2} />
                          <div className="grid gap-3 sm:grid-cols-2">
                            <label className="block text-sm font-medium text-stone-700">Estimated days
                              <input className={inputClass} max="3650" min="1" onChange={(event) => updateMilestone(index, { estimatedDays: event.target.value })} required type="number" value={milestone.estimatedDays} />
                            </label>
                            <label className="block text-sm font-medium text-stone-700">Suggested amount ({currency})
                              <input className={inputClass} max="21474836.47" min="0.01" onChange={(event) => updateMilestone(index, { suggestedAmount: event.target.value })} required step="0.01" type="number" value={milestone.suggestedAmount} />
                            </label>
                          </div>
                        </div>
                      </article>
                    ))}
                    <p className={`text-sm font-semibold ${planMatchesBudget ? 'text-forest-700' : 'text-rose-700'}`}>
                      Suggested total: {currency} {(milestoneTotal / 100).toFixed(2)} / {(budgetCents / 100).toFixed(2)}
                      {!planMatchesBudget && ' — adjust milestone amounts to match the budget.'}
                    </p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <ListEditor label="Risks" onChange={(value) => setPlan({ ...plan, risksText: value })} value={plan.risksText} rows={2} />
                    <ListEditor label="Missing information" onChange={(value) => setPlan({ ...plan, missingInformationText: value })} value={plan.missingInformationText} rows={2} />
                  </div>
                  <ListEditor label="Questions for the client" onChange={(value) => setPlan({ ...plan, clientQuestionsText: value })} value={plan.clientQuestionsText} rows={2} />
                  <p className="text-xs text-stone-500">Total estimated duration is calculated from the sequential milestone durations.</p>
                </div>
              )}
            </div>
          </div>
          <div className="mt-7 flex flex-col-reverse justify-end gap-2 border-t border-stone-100 pt-5 sm:flex-row">
            <Button disabled={saving || generating} type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
            <Button disabled={saving || generating || (plan !== null && (!planIsCurrent || !planMatchesBudget))} icon="arrow-right" type="submit">
              {saving ? 'Saving…' : plan ? 'Approve & create project' : 'Create project'}
            </Button>
          </div>
        </form>

        <aside className="rounded-2xl border border-[#dce9df] bg-[#eff5f0] p-5">
          <div className="flex size-9 items-center justify-center rounded-xl bg-white text-forest-700"><Icon className="size-[18px]" name="sparkle" /></div>
          <h2 className="mt-4 text-sm font-semibold text-forest-900">A clear scope starts here</h2>
          <p className="mt-1.5 text-sm leading-6 text-forest-800/75">Gemini turns the client brief into an editable starting point. You stay in control of every scope and milestone decision.</p>
          <div className="mt-5 space-y-3 border-t border-forest-900/10 pt-4 text-xs leading-5 text-forest-800/80">
            <p className="flex gap-2"><Icon className="mt-0.5 size-4 shrink-0" name="check" /> Generated amounts are suggestions, not approved charges.</p>
            <p className="flex gap-2"><Icon className="mt-0.5 size-4 shrink-0" name="check" /> Unapproved AI drafts are not stored.</p>
            <p className="flex gap-2"><Icon className="mt-0.5 size-4 shrink-0" name="check" /> Milestone suggestions must add up to the exact budget.</p>
          </div>
        </aside>
      </div>
    </>
  )
}
