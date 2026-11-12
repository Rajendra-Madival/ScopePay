import type { ReactNode } from 'react'
import type { User } from '../types'
import { Icon } from './Icon'
import type { IconName } from './Icon'

export type Page = 'dashboard' | 'projects' | 'payments' | 'create' | 'details' | 'profile'

const navigation: { id: Page; label: string; icon: IconName }[] = [
  { id: 'dashboard', label: 'Overview', icon: 'grid' },
  { id: 'projects', label: 'Projects', icon: 'briefcase' },
  { id: 'payments', label: 'Payments', icon: 'wallet' },
]

export function AppShell({
  page,
  onNavigate,
  onCreate,
  onLogout,
  user,
  children,
}: {
  page: Page
  onNavigate: (page: Page) => void
  onCreate: () => void
  onLogout?: () => void
  user?: User | null
  children: ReactNode
}) {
  const activePage = page === 'create' || page === 'details' ? 'projects' : page

  return (
    <div className="min-h-screen bg-[#f7f8f6] text-stone-900">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] border-r border-stone-200/80 bg-white lg:flex lg:flex-col">
        <div className="flex h-[76px] items-center gap-3 px-7">
          <span className="flex size-9 items-center justify-center rounded-xl bg-forest-700 text-white">
            <Icon className="size-[19px]" name="layers" />
          </span>
          <span className="text-[17px] font-bold tracking-tight text-stone-900">
            scope<span className="text-forest-700">pay</span>
          </span>
        </div>
        <div className="mx-5 mb-5 rounded-xl border border-emerald-100 bg-emerald-50/70 px-3.5 py-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-forest-700">
            Workspace
          </p>
          <p className="mt-1 text-sm font-semibold text-stone-800">Freelancer studio</p>
        </div>
        <nav aria-label="Main navigation" className="space-y-1 px-3">
          {navigation.map((item) => (
            <button
              aria-current={activePage === item.id ? 'page' : undefined}
              className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors ${
                activePage === item.id
                  ? 'bg-forest-50 text-forest-800'
                  : 'text-stone-500 hover:bg-stone-50 hover:text-stone-800'
              }`}
              key={item.id}
              onClick={() => onNavigate(item.id)}
            >
              <Icon className="size-[18px]" name={item.icon} />
              {item.label}
              {activePage === item.id && (
                <span className="ml-auto size-1.5 rounded-full bg-forest-600" />
              )}
            </button>
          ))}
        </nav>
        <div className="mt-auto border-t border-stone-100 p-4">
          <div className="flex items-center gap-3 rounded-xl px-2 py-2">
            <div className="flex size-9 items-center justify-center rounded-full bg-[#e6eee8] text-xs font-bold text-forest-800">
              {user?.name ? user.name.split(' ').map((part) => part[0]).slice(0,2).join('').toUpperCase() : 'GU'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-stone-800">{user?.name ?? 'Guest'}</p>
              <p className="text-xs text-stone-500">{user ? 'Workspace owner' : 'Guest access'}</p>
            </div>
          </div>
          {(user || onLogout) && (
            <div className="mt-2 grid gap-1">
              {user && (
                <button
                  aria-current={page === 'profile' ? 'page' : undefined}
                  className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-forest-700 transition-colors hover:bg-forest-50 hover:text-forest-800"
                  onClick={() => onNavigate('profile')}
                  type="button"
                >
                  Profile
                </button>
              )}
              {onLogout && (
                <button
                  className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-stone-600 transition-colors hover:bg-stone-50 hover:text-stone-900"
                  onClick={onLogout}
                  type="button"
                >
                  Log out
                </button>
              )}
            </div>
          )}
        </div>
      </aside>

      <div className="min-h-screen lg:pl-[248px]">
        <header className="sticky top-0 z-20 flex h-[68px] items-center justify-between border-b border-stone-200/80 bg-white/95 px-4 backdrop-blur sm:px-7 lg:h-[76px] lg:px-10">
          <div className="flex items-center gap-2 lg:hidden">
            <span className="flex size-8 items-center justify-center rounded-lg bg-forest-700 text-white">
              <Icon className="size-4" name="layers" />
            </span>
            <span className="text-sm font-bold tracking-tight">
              scope<span className="text-forest-700">pay</span>
            </span>
          </div>
          <div className="hidden items-center gap-2 text-sm text-stone-400 sm:flex">
            <span>Workspace</span>
            <span>/</span>
            <span className="font-medium capitalize text-stone-600">
              {page === 'details' ? 'Project details' : page === 'create' ? 'New project' : page}
            </span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            {user && (
              <button
                className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-100 hover:text-stone-900"
                onClick={() => onNavigate('profile')}
                type="button"
              >
                Profile
              </button>
            )}
            <span className="hidden rounded-full border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs font-medium text-stone-500 sm:inline-flex">
              {user ? `${user.name.split(' ')[0]}'s workspace` : 'Preview workspace'}
            </span>
            {onLogout && (
              <button className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-100 hover:text-stone-900" onClick={onLogout} type="button">
                Log out
              </button>
            )}
            <div className="flex size-8 items-center justify-center rounded-full bg-[#e6eee8] text-[11px] font-bold text-forest-800 lg:hidden">
              {user?.name ? user.name.split(' ').map((part) => part[0]).slice(0,2).join('').toUpperCase() : 'GU'}
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1320px] px-4 pb-28 pt-6 sm:px-7 sm:pt-8 lg:px-10 lg:pb-12 lg:pt-9">
          {children}
          <p className="mt-10 border-t border-stone-200/80 pt-5 text-center text-xs text-stone-400">
            Project data is stored in your ScopePay database · PayPal checkout is not escrow
          </p>
        </main>
      </div>

      <nav
        aria-label="Mobile navigation"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-stone-200 bg-white/95 px-2 pb-[max(env(safe-area-inset-bottom),8px)] pt-2 backdrop-blur lg:hidden"
      >
        {navigation.map((item) => (
          <button
            aria-current={activePage === item.id ? 'page' : undefined}
            className={`flex flex-col items-center gap-1 rounded-xl py-1.5 text-[10px] font-semibold ${
              activePage === item.id ? 'text-forest-800' : 'text-stone-400'
            }`}
            key={item.id}
            onClick={() => onNavigate(item.id)}
          >
            <Icon className="size-[19px]" name={item.icon} />
            {item.label}
          </button>
        ))}
        <button
          className="flex flex-col items-center gap-1 py-1.5 text-[10px] font-semibold text-forest-700"
          onClick={onCreate}
        >
          <span className="flex size-6 items-center justify-center rounded-lg bg-forest-700 text-white">
            <Icon className="size-4" name="plus" />
          </span>
          New
        </button>
      </nav>
    </div>
  )
}
