import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { fetchGuestProfile, updateGuestProfile, FetchGuestProfileResponse, UpdateGuestProfilePayload } from './api'

function formatDate(date: string | Date | null): string {
  if (!date) return ''
  const value = typeof date === 'string' ? new Date(date) : date
  return value.toISOString().split('T')[0]
}

function parseDate(value: string): string | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString().split('T')[0]
}

export default function GuestTokenPage(){
  const [params] = useSearchParams()
  const token = params.get('token') || ''
  const [data, setData] = useState<FetchGuestProfileResponse | null>(null)
  const [form, setForm] = useState<Partial<UpdateGuestProfilePayload>>({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    if (!token) {
      setError('This link is missing a token. Please contact your guide service for assistance.')
      return
    }
    const controller = new AbortController()
    setLoading(true)
    fetchGuestProfile(token, controller.signal)
      .then(profile => {
        setData(profile)
        setForm({
          first_name: profile.first_name || '',
          last_name: profile.last_name || '',
          phone: profile.phone || '',
          dietary_notes: profile.dietary_notes || '',
          medical_notes: profile.medical_notes || '',
          emergency_contact_name: profile.emergency_contact_name || '',
          emergency_contact_phone: profile.emergency_contact_phone || '',
          date_of_birth: parseDate(profile.date_of_birth ?? '') || undefined
        })
        setError(null)
      })
      .catch(() => {
        setError('This link is invalid or has expired. Please contact your guide service for a new one.')
      })
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [token])

  const tripSummary = useMemo(() => {
    if (!data?.bookings?.length) return null
    return data.bookings[0]
  }, [data])

  const handleChange = (field: keyof UpdateGuestProfilePayload) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const value = field === 'date_of_birth' ? (event.target.value ? new Date(event.target.value).toISOString() : null) : event.target.value
    setForm(prev => ({ ...prev, [field]: value ?? '' }))
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!token) return
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const payload: UpdateGuestProfilePayload = {
        first_name: form.first_name || '',
        last_name: form.last_name || '',
        phone: form.phone || '',
        emergency_contact_name: form.emergency_contact_name || '',
        emergency_contact_phone: form.emergency_contact_phone || '',
        dietary_notes: form.dietary_notes || '',
        medical_notes: form.medical_notes || '',
        date_of_birth: form.date_of_birth ? parseDate(form.date_of_birth.toString()) : null
      }
      await updateGuestProfile(token, payload)
      setSuccess('Thank you! Your information has been saved.')
    } catch (err: any) {
      const detail = err?.response?.data?.detail || err?.message || 'Unable to save right now. Please try again.'
      setError(String(detail))
    } finally {
      setSaving(false)
    }
  }

  if (!token) {
    return (
      <PublicPageLayout>
        <ErrorMessage message="This link is invalid." />
      </PublicPageLayout>
    )
  }

  if (loading) {
    return (
      <PublicPageLayout>
        <p className="text-center">Loading your trip…</p>
      </PublicPageLayout>
    )
  }

  if (error) {
    return (
      <PublicPageLayout>
        <ErrorMessage message={error} />
      </PublicPageLayout>
    )
  }

  if (!data) {
    return null
  }

  return (
    <PublicPageLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        <header className="space-y-2 text-center">
          <h1 className="text-3xl font-semibold">{tripSummary ? tripSummary.trip_title : 'Trip Guest Portal'}</h1>
          {tripSummary && (
            <p className="text-gray-600 text-sm">
              {new Date(tripSummary.trip_start).toLocaleString()} – {new Date(tripSummary.trip_end).toLocaleString()}
            </p>
          )}
          <p className="text-gray-600 text-sm">Please confirm or update your details for this trip.</p>
        </header>

        {success && <Alert type="success" message={success} />}

        <form className="space-y-4" onSubmit={handleSubmit}>
          <section className="grid md:grid-cols-2 gap-4">
            <TextField label="First name" value={form.first_name || ''} onChange={handleChange('first_name')} required />
            <TextField label="Last name" value={form.last_name || ''} onChange={handleChange('last_name')} required />
            <TextField label="Phone" value={form.phone || ''} onChange={handleChange('phone')} required />
            <TextField
              label="Date of birth"
              type="date"
              value={formatDate(form.date_of_birth ?? null)}
              onChange={handleChange('date_of_birth')}
            />
          </section>

          <section className="grid md:grid-cols-2 gap-4">
            <TextField
              label="Emergency contact name"
              value={form.emergency_contact_name || ''}
              onChange={handleChange('emergency_contact_name')}
              required
            />
            <TextField
              label="Emergency contact phone"
              value={form.emergency_contact_phone || ''}
              onChange={handleChange('emergency_contact_phone')}
              required
            />
          </section>

          <section className="grid gap-4">
            <TextAreaField
              label="Dietary notes"
              value={form.dietary_notes || ''}
              onChange={handleChange('dietary_notes')}
              placeholder="Food allergies, restrictions, etc."
            />
            <TextAreaField
              label="Medical notes"
              value={form.medical_notes || ''}
              onChange={handleChange('medical_notes')}
              placeholder="Injuries, medications, other notes."
            />
          </section>

          {error && <Alert type="error" message={error} />}

          <button
            type="submit"
            disabled={saving}
            className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-70"
          >
            {saving ? 'Saving…' : 'Save details'}
          </button>
        </form>
      </div>
    </PublicPageLayout>
  )
}

function PublicPageLayout({ children }: { children: React.ReactNode }){
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="max-w-4xl mx-auto p-6 space-y-6">{children}</div>
    </div>
  )
}

function Alert({ type, message }: { type: 'success' | 'error'; message: string }){
  const classes = type === 'success' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'
  return (
    <div className={`border px-3 py-2 rounded ${classes}`}>{message}</div>
  )
}

function ErrorMessage({ message }: { message: string }){
  return (
    <div className="text-center space-y-3">
      <h2 className="text-xl font-semibold">We couldn’t load your trip.</h2>
      <p className="text-gray-600 text-sm">{message}</p>
    </div>
  )
}

type TextFieldProps = {
  label: string
  value: string
  onChange: React.ChangeEventHandler<HTMLInputElement>
  required?: boolean
  type?: string
}

function TextField({ label, value, onChange, required, type = 'text' }: TextFieldProps){
  return (
    <label className="space-y-2 text-sm font-medium text-gray-700 block">
      <span>{label}{required ? ' *' : ''}</span>
      <input
        type={type}
        required={required}
        value={value}
        onChange={onChange}
        className="w-full border rounded px-3 py-2"
      />
    </label>
  )
}

function TextAreaField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: React.ChangeEventHandler<HTMLTextAreaElement>; placeholder?: string }){
  return (
    <label className="space-y-2 text-sm font-medium text-gray-700 block">
      <span>{label}</span>
      <textarea
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        rows={3}
        className="w-full border rounded px-3 py-2"
      />
    </label>
  )
}
