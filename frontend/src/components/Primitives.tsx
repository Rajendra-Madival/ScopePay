import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Icon } from './Icon'
import type { IconName } from './Icon'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'quiet' | 'danger'
  icon?: IconName
  children: ReactNode
}

export function Button({
  variant = 'primary',
  icon,
  children,
  className = '',
  ...props
}: ButtonProps) {
  const variants = {
    primary: 'bg-forest-700 text-white shadow-sm hover:bg-forest-800',
    secondary:
      'border border-stone-200 bg-white text-stone-700 hover:border-stone-300 hover:bg-stone-50',
    quiet: 'text-stone-600 hover:bg-stone-100 hover:text-stone-900',
    danger: 'text-rose-600 hover:bg-rose-50',
  }

  return (
    <button
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
      {...props}
    >
      {icon && <Icon className="size-4" name={icon} />}
      {children}
    </button>
  )
}

export function StatusBadge({ paid }: { paid: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
        paid
          ? 'bg-emerald-50 text-emerald-800'
          : 'bg-amber-50 text-amber-800'
      }`}
    >
      <span className={`size-1.5 rounded-full ${paid ? 'bg-emerald-600' : 'bg-amber-500'}`} />
      {paid ? 'Paid' : 'Pending'}
    </span>
  )
}

export function ProjectStatusBadge({ completed }: { completed: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
        completed
          ? 'bg-emerald-50 text-emerald-800'
          : 'bg-sky-50 text-sky-800'
      }`}
    >
      <span className={`size-1.5 rounded-full ${completed ? 'bg-emerald-600' : 'bg-sky-500'}`} />
      {completed ? 'Completed' : 'In progress'}
    </span>
  )
}

export function ScopeStatusBadge({ status }: { status: 'PENDING' | 'REVIEWED' | 'ACCEPTED' | 'REJECTED' }) {
  const map = {
    PENDING: 'bg-amber-50 text-amber-800',
    REVIEWED: 'bg-sky-50 text-sky-800',
    ACCEPTED: 'bg-emerald-50 text-emerald-800',
    REJECTED: 'bg-rose-50 text-rose-800',
  }

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${map[status]}`}>
      <span className={`size-1.5 rounded-full ${status === 'ACCEPTED' ? 'bg-emerald-600' : status === 'REJECTED' ? 'bg-rose-500' : status === 'REVIEWED' ? 'bg-sky-500' : 'bg-amber-500'}`} />
      {status}
    </span>
  )
}

export function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="mb-7 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && (
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-forest-700">
            {eyebrow}
          </p>
        )}
        <h1 className="text-2xl font-semibold tracking-tight text-stone-900 sm:text-[30px]">
          {title}
        </h1>
        {description && <p className="mt-1.5 text-sm text-stone-500">{description}</p>}
      </div>
      {action}
    </div>
  )
}
