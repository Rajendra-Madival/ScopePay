import { useState } from 'react'
import type { User } from '../types'
import { Button, PageHeading } from './Primitives'

export function ProfilePage({
  user,
  onSaveProfile,
  onChangePassword,
}: {
  user: User
  onSaveProfile: (input: { name: string; email: string }) => Promise<User>
  onChangePassword: (input: { currentPassword: string; newPassword: string }) => Promise<User>
}) {
  const [name, setName] = useState(user.name)
  const [email, setEmail] = useState(user.email)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)
  const [profileError, setProfileError] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [profileNotice, setProfileNotice] = useState('')
  const [passwordNotice, setPasswordNotice] = useState('')

  async function submitProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setProfileError('')
    setProfileNotice('')
    setSavingProfile(true)
    try {
      const updated = await onSaveProfile({ name, email })
      setName(updated.name)
      setEmail(updated.email)
      setProfileNotice('Profile updated.')
    } catch (cause) {
      setProfileError(cause instanceof Error ? cause.message : 'Profile could not be updated.')
    } finally {
      setSavingProfile(false)
    }
  }

  async function submitPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPasswordError('')
    setPasswordNotice('')
    if (newPassword !== confirmPassword) {
      setPasswordError('The new passwords do not match.')
      return
    }

    setSavingPassword(true)
    try {
      await onChangePassword({ currentPassword, newPassword })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setPasswordNotice('Password changed. Other active sessions have been signed out.')
    } catch (cause) {
      setPasswordError(cause instanceof Error ? cause.message : 'Password could not be changed.')
    } finally {
      setSavingPassword(false)
    }
  }

  return (
    <>
      <PageHeading
        eyebrow="Account settings"
        title="Your profile"
        description="Manage your account details and password."
      />

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(27,39,30,0.03)] sm:p-6">
          <div className="mb-5">
            <h2 className="text-base font-semibold text-stone-900">Personal details</h2>
            <p className="mt-1 text-sm text-stone-500">Your name and sign-in email.</p>
          </div>
          <form className="space-y-4" onSubmit={submitProfile}>
            <label className="block" htmlFor="profile-name">
              <span className="mb-1.5 block text-sm font-medium text-stone-700">Full name</span>
              <input
                autoComplete="name"
                className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3.5 py-2.5 text-sm outline-none focus:border-forest-500 focus:bg-white"
                id="profile-name"
                maxLength={80}
                minLength={2}
                onChange={(event) => setName(event.target.value)}
                required
                value={name}
              />
            </label>
            <label className="block" htmlFor="profile-email">
              <span className="mb-1.5 block text-sm font-medium text-stone-700">Email</span>
              <input
                autoComplete="email"
                className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3.5 py-2.5 text-sm outline-none focus:border-forest-500 focus:bg-white"
                id="profile-email"
                maxLength={254}
                onChange={(event) => setEmail(event.target.value)}
                required
                type="email"
                value={email}
              />
            </label>
            {profileError && <p className="text-sm text-rose-700" role="alert">{profileError}</p>}
            {profileNotice && <p className="text-sm text-emerald-700" role="status">{profileNotice}</p>}
            <Button disabled={savingProfile} type="submit">{savingProfile ? 'Saving…' : 'Save profile'}</Button>
          </form>
        </section>

        <section className="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(27,39,30,0.03)] sm:p-6">
          <div className="mb-5">
            <h2 className="text-base font-semibold text-stone-900">Change password</h2>
            <p className="mt-1 text-sm text-stone-500">Use at least 12 characters. Other active sessions will be revoked.</p>
          </div>
          <form className="space-y-4" onSubmit={submitPassword}>
            <label className="block" htmlFor="current-password">
              <span className="mb-1.5 block text-sm font-medium text-stone-700">Current password</span>
              <input
                autoComplete="current-password"
                className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3.5 py-2.5 text-sm outline-none focus:border-forest-500 focus:bg-white"
                id="current-password"
                onChange={(event) => setCurrentPassword(event.target.value)}
                required
                type="password"
                value={currentPassword}
              />
            </label>
            <label className="block" htmlFor="new-password">
              <span className="mb-1.5 block text-sm font-medium text-stone-700">New password</span>
              <input
                autoComplete="new-password"
                className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3.5 py-2.5 text-sm outline-none focus:border-forest-500 focus:bg-white"
                id="new-password"
                minLength={12}
                onChange={(event) => setNewPassword(event.target.value)}
                required
                type="password"
                value={newPassword}
              />
            </label>
            <label className="block" htmlFor="confirm-new-password">
              <span className="mb-1.5 block text-sm font-medium text-stone-700">Confirm new password</span>
              <input
                autoComplete="new-password"
                className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3.5 py-2.5 text-sm outline-none focus:border-forest-500 focus:bg-white"
                id="confirm-new-password"
                minLength={12}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
                type="password"
                value={confirmPassword}
              />
            </label>
            {passwordError && <p className="text-sm text-rose-700" role="alert">{passwordError}</p>}
            {passwordNotice && <p className="text-sm text-emerald-700" role="status">{passwordNotice}</p>}
            <Button disabled={savingPassword} type="submit">{savingPassword ? 'Changing…' : 'Change password'}</Button>
          </form>
        </section>
      </div>
    </>
  )
}
