import { useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'

import { CreatePartyPayload, CreatePartyResponse, createParty } from './api'

export type TripSummary = {
  id: number
  title: string
  location?: string
  start: string
  end: string
  price_cents: number
  guide_service?: number
  guide_service_name?: string
}

type Props = {
  trip: TripSummary
  onClose: () => void
  onCreated?: (party: CreatePartyResponse) => void
}

type GuestForm = {
  email: string
  first_name: string
  last_name: string
  phone: string
}

const emptyGuest: GuestForm = { email: '', first_name: '', last_name: '', phone: '' }

export default function CreatePartyForm({ trip, onClose, onCreated }: Props){
  const [primary, setPrimary] = useState<GuestForm>(emptyGuest)
  const [additionalGuests, setAdditionalGuests] = useState<GuestForm[]>([])
  const [partySize, setPartySize] = useState<number | ''>('')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<CreatePartyResponse | null>(null)

  const mutation = useMutation({
    mutationFn: (payload: CreatePartyPayload) => createParty(trip.id, payload),
    onSuccess: (data) => {
      setResult(data)
      setError(null)
      onCreated?.(data)
    },
    onError: (err: any) => {
      const detail = err?.response?.data?.detail || err?.message || 'Unable to create party.'
      setError(String(detail))
      setResult(null)
    }
  })

  const calculatedPartySize = useMemo(() => {
    const base = 1 + additionalGuests.filter(guest => guest.email.trim()).length
    if (partySize === '') return base
    return Math.max(base, Number(partySize))
  }, [additionalGuests, partySize])

  const handlePrimaryChange = (field: keyof GuestForm) => (event: React.ChangeEvent<HTMLInputElement>) => {
    setPrimary(prev => ({ ...prev, [field]: event.target.value }))
  }

  const handleAdditionalChange = (index: number, field: keyof GuestForm) => (event: React.ChangeEvent<HTMLInputElement>) => {
    setAdditionalGuests(prev => prev.map((guest, i) => i === index ? { ...guest, [field]: event.target.value } : guest))
  }

  const addAdditionalGuest = () => {
    setAdditionalGuests(prev => [...prev, emptyGuest])
  }

  const removeAdditionalGuest = (index: number) => {
    setAdditionalGuests(prev => prev.filter((_, i) => i !== index))
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

    if (!primary.email.trim()) {
      setError('Primary guest email is required.')
      return
    }

    const extraGuests = additionalGuests
      .filter(guest => guest.email.trim())
      .map(guest => ({ ...guest }))

    const payload: CreatePartyPayload = {
      primary_guest: { ...primary },
      additional_guests: extraGuests.length ? extraGuests : undefined,
      party_size: typeof partySize === 'number' ? partySize : undefined
    }

    mutation.mutate(payload)
  }

  const paymentLink = result?.payment_url || ''
  const guestLink = result?.guest_portal_url || ''

  return (
    <div className="border rounded-lg bg-white shadow-md p-6 space-y-5">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold">Create party for {trip.title}</h2>
        <p className="text-sm text-gray-600">Trip date: {new Date(trip.start).toLocaleDateString()} · ${(trip.price_cents / 100).toFixed(2)} per guest</p>
      </header>

      <form className="space-y-6" onSubmit={handleSubmit} noValidate>
        <section className="space-y-3">
          <h3 className="font-medium">Primary guest</h3>
          <div className="grid md:grid-cols-2 gap-3">
            <TextField label="Email" required value={primary.email} onChange={handlePrimaryChange('email')} type="email" />
            <TextField label="Phone" value={primary.phone} onChange={handlePrimaryChange('phone')} />
            <TextField label="First name" value={primary.first_name} onChange={handlePrimaryChange('first_name')} />
            <TextField label="Last name" value={primary.last_name} onChange={handlePrimaryChange('last_name')} />
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-medium">Additional guests</h3>
            <button type="button" className="text-sm text-blue-600 underline" onClick={addAdditionalGuest}>Add guest</button>
          </div>
          {additionalGuests.length === 0 && <p className="text-sm text-gray-500">No additional guests yet.</p>}
          <div className="space-y-3">
            {additionalGuests.map((guest, index) => (
              <div key={index} className="border rounded px-3 py-3">
                <div className="grid md:grid-cols-2 gap-3">
                  <TextField label="Email" required value={guest.email} onChange={handleAdditionalChange(index, 'email')} type="email" />
                  <TextField label="Phone" value={guest.phone} onChange={handleAdditionalChange(index, 'phone')} />
                  <TextField label="First name" value={guest.first_name} onChange={handleAdditionalChange(index, 'first_name')} />
                  <TextField label="Last name" value={guest.last_name} onChange={handleAdditionalChange(index, 'last_name')} />
                </div>
                <div className="text-right mt-2">
                  <button type="button" className="text-xs text-red-600 underline" onClick={() => removeAdditionalGuest(index)}>Remove</button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-2">
          <label className="text-sm font-medium text-gray-700 block">
            Party size
            <input
              type="number"
              min={1}
              value={partySize}
              onChange={(event) => setPartySize(event.target.value === '' ? '' : Number(event.target.value))}
              className="mt-1 w-full border rounded px-3 py-2"
            />
          </label>
          <p className="text-xs text-gray-500">Calculated minimum based on guests: {calculatedPartySize}</p>
        </section>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {mutation.isError && !error && <p className="text-sm text-red-600">Unable to create party.</p>}

        <div className="flex items-center gap-3">
          <button type="submit" disabled={mutation.isLoading} className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-70">
            {mutation.isLoading ? 'Creating…' : 'Create party'}
          </button>
          <button type="button" onClick={onClose} className="text-sm underline text-gray-600">Cancel</button>
        </div>
      </form>

      {result && (
        <section className="space-y-3 border-t pt-4">
          <h3 className="font-medium">Party created</h3>
          <p className="text-sm text-gray-700">Share these links with the primary guest:</p>
          <LinkRow label="Payment" url={paymentLink} />
          <LinkRow label="Guest details" url={guestLink} />
        </section>
      )}
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
    <label className="text-sm font-medium text-gray-700 block">
      <span>{label}{required ? ' *' : ''}</span>
      <input
        type={type}
        value={value}
        onChange={onChange}
        required={required}
        className="mt-1 w-full border rounded px-3 py-2"
      />
    </label>
  )
}

function LinkRow({ label, url }: { label: string; url: string }){
  const copyToClipboard = () => {
    if (!url) return
    navigator.clipboard.writeText(url).catch(() => {})
  }

  return (
    <div className="flex items-center justify-between gap-3 border rounded px-3 py-2 bg-slate-50">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-gray-600 break-all">{url || 'Link unavailable'}</p>
      </div>
      {url && (
        <button type="button" className="text-xs text-blue-600 underline" onClick={copyToClipboard}>Copy</button>
      )}
    </div>
  )
}
