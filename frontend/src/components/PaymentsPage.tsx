import type { Payment } from '../lib/api'
import { Icon } from './Icon'
import { Button, PageHeading } from './Primitives'
import { formatDate, formatMoney } from '../utils/format'

const paymentLabels: Record<Payment['status'], string> = {
  CREATING: 'Creating checkout',
  PENDING: 'Awaiting capture',
  PROCESSING: 'Verifying capture',
  COMPLETED: 'Completed',
  FAILED: 'Failed',
  CANCELLED: 'Cancelled',
}

function PaymentStatus({ status }: { status: Payment['status'] }) {
  const tone =
    status === 'COMPLETED'
      ? 'bg-emerald-50 text-emerald-800'
      : status === 'FAILED'
        ? 'bg-rose-50 text-rose-700'
        : status === 'CANCELLED'
          ? 'bg-stone-100 text-stone-600'
          : 'bg-amber-50 text-amber-800'
  const dot =
    status === 'COMPLETED'
      ? 'bg-emerald-600'
      : status === 'FAILED'
        ? 'bg-rose-500'
        : status === 'CANCELLED'
          ? 'bg-stone-400'
          : 'bg-amber-500'

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>
      <span className={`size-1.5 rounded-full ${dot}`} />
      {paymentLabels[status]}
    </span>
  )
}

export function PaymentsPage({
  payments,
  onOpenProject,
}: {
  payments: Payment[]
  onOpenProject: (id: string) => void
}) {
  const completed = payments.filter((payment) => payment.status === 'COMPLETED')
  const pending = payments.filter((payment) => ['PENDING', 'PROCESSING'].includes(payment.status))
  const completedTotal = completed.reduce((total, payment) => total + payment.amount, 0)
  const pendingTotal = pending.reduce((total, payment) => total + payment.amount, 0)

  return (
    <>
      <PageHeading eyebrow="Project finances" title="Payment status" description="PayPal checkout records and their server-verified status." />
      <div className="mb-6 flex items-start gap-3 rounded-2xl border border-[#dce9df] bg-[#eff5f0] px-4 py-3.5">
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-white text-forest-700"><Icon className="size-4" name="more" /></span>
        <div><p className="text-sm font-semibold text-forest-900">Checkout is not escrow</p><p className="mt-0.5 text-xs leading-5 text-forest-800/75">A completed status means PayPal reported a successful capture that ScopePay verified. ScopePay does not provide escrow or payment protection.</p></div>
      </div>

      <section aria-label="Payment totals" className="mb-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-stone-200/80 bg-white p-5">
          <div className="flex items-center gap-2 text-sm text-stone-500"><span className="size-2 rounded-full bg-amber-400" /> Pending capture</div>
          <p className="mt-3 text-[28px] font-semibold tracking-tight text-stone-900">{formatMoney(pendingTotal)}</p>
          <p className="mt-1 text-xs text-stone-400">{pending.length} checkout records awaiting verification</p>
        </div>
        <div className="rounded-2xl border border-stone-200/80 bg-white p-5">
          <div className="flex items-center gap-2 text-sm text-stone-500"><span className="size-2 rounded-full bg-emerald-500" /> Verified completed</div>
          <p className="mt-3 text-[28px] font-semibold tracking-tight text-stone-900">{formatMoney(completedTotal)}</p>
          <p className="mt-1 text-xs text-stone-400">{completed.length} server-verified captures</p>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-[0_1px_2px_rgba(27,39,30,0.03)]">
        <div className="border-b border-stone-100 px-5 py-4 sm:px-6">
          <h2 className="text-base font-semibold text-stone-900">PayPal checkout records</h2>
          <p className="mt-0.5 text-xs text-stone-500">Amounts come from the corresponding milestone in your database.</p>
        </div>
        {payments.length === 0 ? (
          <div className="px-5 py-14 text-center">
            <span className="mx-auto flex size-11 items-center justify-center rounded-2xl bg-stone-50 text-stone-400"><Icon className="size-5" name="wallet" /></span>
            <h3 className="mt-3 text-sm font-semibold text-stone-800">No PayPal checkouts yet</h3>
            <p className="mx-auto mt-1 max-w-sm text-sm text-stone-500">Start checkout from an unpaid milestone. The payment record will appear here after the backend creates the PayPal order.</p>
          </div>
        ) : (
          <div className="divide-y divide-stone-100">
            {payments.map((payment) => (
              <div className="grid gap-3 px-5 py-4 sm:grid-cols-[minmax(0,1.4fr)_minmax(140px,.8fr)_minmax(120px,.8fr)_auto] sm:items-center sm:gap-4 sm:px-6" key={payment.id}>
                <div className="min-w-0"><p className="truncate text-sm font-semibold text-stone-800">{payment.milestone.title}</p><button className="mt-0.5 truncate text-xs text-stone-400 hover:text-forest-700" onClick={() => onOpenProject(payment.milestone.project.id)}>{payment.milestone.project.title} · {payment.milestone.project.clientName}</button></div>
                <div className="flex items-center justify-between sm:block"><span className="text-xs text-stone-400 sm:hidden">Amount</span><span className="text-sm font-semibold text-stone-800">{formatMoney(payment.amount)}</span></div>
                <div className="flex items-center justify-between sm:block"><span className="text-xs text-stone-400 sm:hidden">Status</span><PaymentStatus status={payment.status} /></div>
                <div className="flex items-center justify-between gap-3 sm:block"><span className="text-xs text-stone-400 sm:hidden">Created</span><span className="text-sm text-stone-500">{formatDate(payment.createdAt)}</span><Button className="sm:hidden" icon="arrow-right" variant="quiet" onClick={() => onOpenProject(payment.milestone.project.id)}>Project</Button><Button className="hidden sm:inline-flex" icon="arrow-right" variant="quiet" onClick={() => onOpenProject(payment.milestone.project.id)}>Project</Button></div>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  )
}
