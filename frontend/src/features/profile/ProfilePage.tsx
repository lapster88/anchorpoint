import { ChangeEvent, FormEvent, useEffect, useRef, useState } from 'react'
import { useAuth } from '../../lib/auth'
import AvailabilityManager from './AvailabilityManager'
import CalendarIntegrationManager from './CalendarIntegrationManager'

type FormState = {
  email: string
  first_name: string
  last_name: string
  display_name: string
}

const emptyState: FormState = {
  email: '',
  first_name: '',
  last_name: '',
  display_name: ''
}

/**
 * Simple profile editor so guides/guests can update their personal details.
 */
export default function ProfilePage() {
  const { user, updateProfile, changePassword } = useAuth()
  const [form, setForm] = useState<FormState>(emptyState)
  const [saving, setSaving] = useState(false)
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null)
  const [profileError, setProfileError] = useState<string | null>(null)
  const profileSuccessTimeoutRef = useRef<number | null>(null)
  const [passwordForm, setPasswordForm] = useState({
    current_password: '',
    new_password: '',
    confirm_password: ''
  })
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const passwordSuccessTimeoutRef = useRef<number | null>(null)

  useEffect(() => {
    if (user) {
      setForm({
        email: user.email || '',
        first_name: user.first_name || '',
        last_name: user.last_name || '',
        display_name: user.display_name || ''
      })
    }
  }, [user])

  const handleChange = (field: keyof FormState) => (event: ChangeEvent<HTMLInputElement>) => {
    setForm(prev => ({ ...prev, [field]: event.target.value }))
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)
    setProfileSuccess(null)
    setProfileError(null)
    try {
      await updateProfile({
        email: form.email,
        first_name: form.first_name,
        last_name: form.last_name,
        display_name: form.display_name.trim() || null
      })
      setProfileSuccess('Profile updated')
    } catch (err: any) {
      const detail =
        err?.response?.data?.detail ||
        err?.response?.data?.email?.[0] ||
        err?.response?.data?.first_name?.[0] ||
        err?.message ||
        'Unable to update your profile right now.'
      setProfileError(String(detail))
    } finally {
      setSaving(false)
    }
  }

  const handlePasswordChange = (field: 'current_password' | 'new_password' | 'confirm_password') =>
    (event: ChangeEvent<HTMLInputElement>) => {
      setPasswordForm(prev => ({ ...prev, [field]: event.target.value }))
    }

  const handlePasswordSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setPasswordSaving(true)
    setPasswordSuccess(null)
    setPasswordError(null)
    if (passwordForm.new_password.length < 8) {
      setPasswordSaving(false)
      setPasswordError('Password must be at least 8 characters.')
      return
    }
    if (passwordForm.new_password !== passwordForm.confirm_password) {
      setPasswordSaving(false)
      setPasswordError('Passwords do not match.')
      return
    }
    try {
      await changePassword({
        current_password: passwordForm.current_password,
        new_password: passwordForm.new_password
      })
      setPasswordSuccess('Password updated')
      setPasswordForm({
        current_password: '',
        new_password: '',
        confirm_password: ''
      })
    } catch (err: any) {
      const detail =
        err?.response?.data?.detail ||
        err?.response?.data?.current_password?.[0] ||
        err?.response?.data?.new_password?.[0] ||
        err?.message ||
        'Unable to change password right now.'
      setPasswordError(String(detail))
    } finally {
      setPasswordSaving(false)
    }
  }

  useEffect(() => {
    if (!profileSuccess) return
    // Show success briefly, then hide to avoid stale banners.
    profileSuccessTimeoutRef.current = window.setTimeout(() => {
      setProfileSuccess(null)
      profileSuccessTimeoutRef.current = null
    }, 2500)
    return () => {
      if (profileSuccessTimeoutRef.current) {
        window.clearTimeout(profileSuccessTimeoutRef.current)
        profileSuccessTimeoutRef.current = null
      }
    }
  }, [profileSuccess])

  useEffect(() => {
    if (!passwordSuccess) return
    passwordSuccessTimeoutRef.current = window.setTimeout(() => {
      setPasswordSuccess(null)
      passwordSuccessTimeoutRef.current = null
    }, 2500)
    return () => {
      if (passwordSuccessTimeoutRef.current) {
        window.clearTimeout(passwordSuccessTimeoutRef.current)
        passwordSuccessTimeoutRef.current = null
      }
    }
  }, [passwordSuccess])

  if (!user) return null

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-10">
      <div>
        <h2 className="text-2xl font-semibold">Profile</h2>
        <p className="text-gray-600 text-sm">Update your contact details and display name.</p>
      </div>
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="block text-sm font-medium">First name</label>
            <input
              type="text"
              required
              value={form.first_name}
              onChange={handleChange('first_name')}
              className="w-full border rounded px-3 py-2"
            />
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-medium">Last name</label>
            <input
              type="text"
              required
              value={form.last_name}
              onChange={handleChange('last_name')}
              className="w-full border rounded px-3 py-2"
            />
          </div>
        </div>
        <div className="space-y-2">
          <label className="block text-sm font-medium">Email</label>
          <input
            type="email"
            required
            value={form.email}
            onChange={handleChange('email')}
            className="w-full border rounded px-3 py-2"
          />
        </div>
        <div className="space-y-2">
          <label className="block text-sm font-medium">Display name</label>
          <input
            type="text"
            placeholder="Optional"
            value={form.display_name}
            onChange={handleChange('display_name')}
            className="w-full border rounded px-3 py-2"
          />
          <p className="text-xs text-gray-500">Shown on trip rosters and dashboards.</p>
        </div>
        {profileError && <div className="text-sm text-red-600">{profileError}</div>}
        {profileSuccess && <div className="text-sm text-green-600">{profileSuccess}</div>}
        <button
          type="submit"
          disabled={saving}
          className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-70"
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </form>

      <div className="pt-6 border-t space-y-4">
        <div>
          <h3 className="text-xl font-semibold">Change Password</h3>
          <p className="text-gray-600 text-sm">Enter your current password and choose a new one.</p>
        </div>
        <form className="space-y-4" onSubmit={handlePasswordSubmit}>
          <div className="space-y-2">
            <label className="block text-sm font-medium">Current password</label>
            <input
              type="password"
              required
              value={passwordForm.current_password}
              onChange={handlePasswordChange('current_password')}
              className="w-full border rounded px-3 py-2"
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="block text-sm font-medium">New password</label>
              <input
                type="password"
                required
                value={passwordForm.new_password}
                onChange={handlePasswordChange('new_password')}
                className="w-full border rounded px-3 py-2"
                minLength={8}
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium">Confirm new password</label>
              <input
                type="password"
                required
                value={passwordForm.confirm_password}
                onChange={handlePasswordChange('confirm_password')}
                className="w-full border rounded px-3 py-2"
              />
            </div>
          </div>
          {passwordError && <div className="text-sm text-red-600">{passwordError}</div>}
          {passwordSuccess && <div className="text-sm text-green-600">{passwordSuccess}</div>}
          <button
            type="submit"
            disabled={passwordSaving}
            className="bg-slate-800 text-white px-4 py-2 rounded disabled:opacity-70"
          >
            {passwordSaving ? 'Updating…' : 'Update password'}
          </button>
        </form>
      </div>

      <div className="space-y-10 pt-6 border-t">
        <AvailabilityManager />
        <CalendarIntegrationManager />
      </div>
    </div>
  )
}
