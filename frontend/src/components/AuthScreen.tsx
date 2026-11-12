import { useState } from 'react'
import { Button } from './Primitives'

export type AuthMode = 'login' | 'signup' | 'forgot-password' | 'reset-password'

export function AuthScreen({
  mode,
  resetToken,
  onNavigate,
  onLogin,
  onRegister,
  onForgotPassword,
  onResetPassword,
}: {
  mode: AuthMode
  resetToken: string
  onNavigate: (path: string) => void
  onLogin: (input: { email: string; password: string }) => Promise<void>
  onRegister: (input: { name: string; email: string; password: string }) => Promise<void>
  onForgotPassword: (email: string) => Promise<string>
  onResetPassword: (token: string, password: string) => Promise<void>
}) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const isAuthForm = mode === 'login' || mode === 'signup'
  const title = {
    login: 'Welcome back',
    signup: 'Create your account',
    'forgot-password': 'Reset your password',
    'reset-password': 'Choose a new password',
  }[mode]

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setNotice('')
    setSubmitting(true)

    try {
      if (mode === 'login') {
        await onLogin({ email, password })
      } else if (mode === 'signup') {
        await onRegister({ name, email, password })
      } else if (mode === 'forgot-password') {
        setNotice(await onForgotPassword(email))
      } else {
        if (!resetToken) throw new Error('This password reset link is invalid or expired.')
        if (password !== confirmPassword) throw new Error('The passwords do not match.')
        await onResetPassword(resetToken, password)
        setNotice('Password reset successfully. You can now log in.')
        setPassword('')
        setConfirmPassword('')
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The request could not be completed. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#f7f8f6] px-4 py-10 text-stone-900 sm:px-6 sm:py-16 lg:px-8">
      <div className="mx-auto max-w-6xl overflow-hidden rounded-[28px] border border-stone-200/80 bg-white shadow-[0_16px_40px_rgba(17,24,39,0.06)]">
        <div className="grid min-h-[680px] lg:grid-cols-[1.05fr_0.95fr]">
          <div className="relative overflow-hidden bg-[#edf3ee] px-6 py-8 sm:px-8 lg:px-10 lg:py-10">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(42,120,79,0.12),_transparent_45%)]" />
            <div className="relative z-10 flex h-full flex-col">
              <div className="flex items-center gap-3">
                <span className="flex size-11 items-center justify-center rounded-2xl bg-forest-700 text-white">
                  <span className="text-lg font-bold">S</span>
                </span>
                <p className="text-lg font-black tracking-tight">scope<span className="text-forest-700">pay</span></p>
              </div>

              <div className="mt-12 max-w-md">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-forest-700">Built for client work</p>
                <h1 className="mt-4 text-4xl font-semibold tracking-tight text-stone-900">Run projects, payments, and scope approvals from one place.</h1>
                <p className="mt-4 text-base text-stone-600">Keep deliverables, client decisions, and milestone payments aligned from kickoff to sign-off.</p>
              </div>

              <ul className="mt-9 space-y-3 text-sm font-medium text-stone-700">
                {['Private project workspace', 'Milestone payment tracking', 'Clear scope-change history'].map((feature) => (
                  <li className="flex items-center gap-3" key={feature}>
                    <span aria-hidden="true" className="flex size-6 items-center justify-center rounded-full bg-white text-forest-700">✓</span>
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="flex items-center justify-center px-5 py-8 sm:px-8 lg:px-10">
            <div className="w-full max-w-md">
              {isAuthForm && (
                <div className="mb-7 flex items-center justify-between rounded-2xl border border-stone-200 bg-stone-50 p-1">
                  <button
                    aria-current={mode === 'login' ? 'page' : undefined}
                    className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${mode === 'login' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500'}`}
                    onClick={() => onNavigate('/login')}
                    type="button"
                  >
                    Log in
                  </button>
                  <button
                    aria-current={mode === 'signup' ? 'page' : undefined}
                    className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${mode === 'signup' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500'}`}
                    onClick={() => onNavigate('/signup')}
                    type="button"
                  >
                    Sign up
                  </button>
                </div>
              )}

              <div className="mb-6">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-forest-700">Your workspace</p>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight text-stone-900">{title}</h2>
                <p className="mt-2 text-sm text-stone-500">
                  {mode === 'login' && 'Sign in to continue to your private ScopePay workspace.'}
                  {mode === 'signup' && 'Create an account to start managing your client projects.'}
                  {mode === 'forgot-password' && 'Enter your email and we’ll send a reset link if an account exists.'}
                  {mode === 'reset-password' && 'Choose a strong password with at least 12 characters.'}
                </p>
              </div>

              <form className="space-y-4" onSubmit={handleSubmit}>
                {mode === 'signup' && (
                  <label className="block" htmlFor="name">
                    <span className="mb-1.5 block text-sm font-medium text-stone-700">Full name</span>
                    <input
                      autoComplete="name"
                      className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3.5 py-2.5 text-sm text-stone-900 outline-none transition focus:border-forest-500 focus:bg-white"
                      id="name"
                      onChange={(event) => setName(event.target.value)}
                      required
                      type="text"
                      value={name}
                    />
                  </label>
                )}

                {(mode === 'login' || mode === 'signup' || mode === 'forgot-password') && (
                  <label className="block" htmlFor="email">
                    <span className="mb-1.5 block text-sm font-medium text-stone-700">Email</span>
                    <input
                      autoComplete="email"
                      className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3.5 py-2.5 text-sm text-stone-900 outline-none transition focus:border-forest-500 focus:bg-white"
                      id="email"
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="you@company.com"
                      required
                      type="email"
                      value={email}
                    />
                  </label>
                )}

                {(mode === 'login' || mode === 'signup' || mode === 'reset-password') && (
                  <label className="block" htmlFor="password">
                    <span className="mb-1.5 block text-sm font-medium text-stone-700">
                      {mode === 'login' ? 'Password' : 'New password'}
                    </span>
                    <input
                      autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                      className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3.5 py-2.5 text-sm text-stone-900 outline-none transition focus:border-forest-500 focus:bg-white"
                      id="password"
                      minLength={mode === 'login' ? 1 : 12}
                      onChange={(event) => setPassword(event.target.value)}
                      required
                      type="password"
                      value={password}
                    />
                  </label>
                )}

                {mode === 'reset-password' && (
                  <label className="block" htmlFor="confirm-password">
                    <span className="mb-1.5 block text-sm font-medium text-stone-700">Confirm new password</span>
                    <input
                      autoComplete="new-password"
                      className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3.5 py-2.5 text-sm text-stone-900 outline-none transition focus:border-forest-500 focus:bg-white"
                      id="confirm-password"
                      minLength={12}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      required
                      type="password"
                      value={confirmPassword}
                    />
                  </label>
                )}

                {mode === 'signup' && (
                  <p className="text-xs text-stone-500">Use at least 12 characters for your password.</p>
                )}

                {mode === 'login' && (
                  <div className="text-right">
                    <button className="text-sm font-semibold text-forest-700 hover:text-forest-800" onClick={() => onNavigate('/forgot-password')} type="button">
                      Forgot password?
                    </button>
                  </div>
                )}

                {error && (
                  <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">
                    {error}
                  </p>
                )}
                {notice && (
                  <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800" role="status">
                    {notice}
                  </p>
                )}

                <Button className="w-full" disabled={submitting} type="submit">
                  {submitting
                    ? 'Please wait…'
                    : mode === 'login'
                      ? 'Log in to workspace'
                      : mode === 'signup'
                        ? 'Create account'
                        : mode === 'forgot-password'
                          ? 'Send reset link'
                          : 'Reset password'}
                </Button>
              </form>

              <p className="mt-6 text-center text-sm text-stone-500">
                {mode === 'forgot-password' || mode === 'reset-password' ? (
                  <button className="font-semibold text-forest-700" onClick={() => onNavigate('/login')} type="button">
                    Back to log in
                  </button>
                ) : mode === 'login' ? (
                  <>Need a workspace? <button className="font-semibold text-forest-700" onClick={() => onNavigate('/signup')} type="button">Create an account</button></>
                ) : (
                  <>Already have an account? <button className="font-semibold text-forest-700" onClick={() => onNavigate('/login')} type="button">Log in</button></>
                )}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
