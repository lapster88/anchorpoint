import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { createTrip, CreateTripPayload, TripDetail, listServiceGuides, GuideOption } from './api'
import { CreatePartyPayload } from '../staff/api'

const emptyGuest = { email: '', first_name: '', last_name: '', phone: '' }

type GuestForm = typeof emptyGuest

type Props = {
  serviceId: number | null
  serviceName?: string
  onClose: () => void
  onCreated: (trip: TripDetail) => void
}

export default function CreateTripForm({ serviceId, serviceName, onClose, onCreated }: Props){
  const queryClient = useQueryClient()
  const [title, setTitle] = useState('')
  const [location, setLocation] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [price, setPrice] = useState('')
  const [capacity, setCapacity] = useState(1)
  const [description, setDescription] = useState('')
  const [guides, setGuides] = useState<GuideOption[]>([])
  const [selectedGuideIds, setSelectedGuideIds] = useState<number[]>([])

  const [primary, setPrimary] = useState<GuestForm>(emptyGuest)
  const [additionalGuests, setAdditionalGuests] = useState<GuestForm[]>([])
  const [partySize, setPartySize] = useState<number | ''>('')
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: createTrip,
    onSuccess: (trip) => {
      queryClient.invalidateQueries({ queryKey: ['trips'] })
      onCreated(trip)
    },
    onError: (err: any) => {
      const detail = err?.response?.data?.detail || err?.message || 'Unable to create trip.'
      setError(String(detail))
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

  const addAdditionalGuest = () => setAdditionalGuests(prev => [...prev, emptyGuest])
  const removeAdditionalGuest = (index: number) => setAdditionalGuests(prev => prev.filter((_, i) => i !== index))

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

    if (!serviceId) {
      setError('No guide service selected.')
      return
    }
    if (!location.trim() || !start || !end) {
      setError('Trip location, start, and end are required.')
      return
    }
    if (!primary.email.trim()) {
      setError('Primary guest email is required.')
      return
    }
    const priceNumber = Number(price)
    if (Number.isNaN(priceNumber) || priceNumber <= 0) {
      setError('Price must be greater than zero.')
      return
    }

    const extraGuests = additionalGuests
      .filter(guest => guest.email.trim())
      .map(guest => ({ ...guest }))

    const partyPayload: CreatePartyPayload = {
      primary_guest: { ...primary },
      additional_guests: extraGuests.length ? extraGuests : undefined,
      party_size: typeof partySize === 'number' ? partySize : undefined,
    }

    const computedTitle = title.trim() || [primary.first_name, primary.last_name].filter(Boolean).join(' ').trim() || primary.email.trim() || 'Private Trip'

    const payload: CreateTripPayload = {
      guide_service: serviceId,
      title: computedTitle,
      location: location.trim(),
      start: new Date(start).toISOString(),
      end: new Date(end).toISOString(),
      capacity,
      price_cents: Math.round(priceNumber * 100),
      description: description.trim(),
      guides: selectedGuideIds,
      party: partyPayload,
    }

    mutation.mutate(payload)
  }

  useEffect(() => {
    let active = true
    if (!serviceId) {
      setGuides([])
      setSelectedGuideIds([])
      return () => {
        active = false
      }
    }

    listServiceGuides(serviceId)
      .then(data => {
        if (!active) return
        setGuides(data)
        setSelectedGuideIds(prev => prev.filter(id => data.some(guide => guide.id === id)))
      })
      .catch(() => {
        if (!active) return
        setGuides([])
        setSelectedGuideIds([])
      })

    return () => {
      active = false
    }
  }, [serviceId])

  if (!serviceId) {
    return (
      <section className="border rounded-lg bg-white shadow-md p-6 space-y-4">
        <header className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Create trip</h2>
          <button type="button" onClick={onClose} className="text-sm text-gray-600 underline">Close</button>
        </header>
        <p className="text-sm text-gray-600">You don&apos;t have an active guide service selected. Switch services to create a trip.</p>
      </section>
    )
  }

  return (
    <section className="border rounded-lg bg-white shadow-md p-6 space-y-6">
      <header className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Create trip</h2>
        <button type="button" onClick={onClose} className="text-sm text-gray-600 underline">Close</button>
      </header>

      <form className="space-y-6" onSubmit={handleSubmit}>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500">Guide service</p>
            <p className="text-sm text-gray-700 mt-1">{serviceName || 'Unavailable'}</p>
          </div>
          <label className="text-sm font-medium text-gray-700 block">
            Capacity
            <input
              type="number"
              min={1}
              className="mt-1 w-full border rounded px-3 py-2"
              value={capacity}
              onChange={(event) => setCapacity(Number(event.target.value) || 1)}
            />
          </label>
        </div>

        <div className="space-y-1">
          <div>
            <p className="text-sm font-medium text-gray-700">Assigned guides (optional)</p>
            <div className="mt-2 space-y-2">
              {guides.map((guide) => {
                const name = guide.display_name || [guide.first_name, guide.last_name].filter(Boolean).join(' ').trim() || guide.email
                const isChecked = selectedGuideIds.includes(guide.id)
                return (
                  <label key={guide.id} className="inline-flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={isChecked}
                      onChange={(event) => {
                        setSelectedGuideIds(prev =>
                          event.target.checked
                            ? [...prev, guide.id]
                            : prev.filter(id => id !== guide.id)
                        )
                      }}
                      disabled={!serviceId}
                    />
                    <span>{name}</span>
                  </label>
                )
              })}
            </div>
          </div>
          {serviceId && !guides.length && (
            <p className="text-xs text-gray-500">No active guides are assigned to this service yet.</p>
          )}
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <TextField
            label="Trip title (optional)"
            value={title}
            onChange={setTitle}
            placeholder="Defaults to primary guest name"
          />
          <TextField label="Location" value={location} onChange={setLocation} required />
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <DateTimeField label="Start" value={start} onChange={setStart} required />
          <DateTimeField label="End" value={end} onChange={setEnd} required />
        </div>

        <label className="text-sm font-medium text-gray-700 block">
          Price (USD)
          <input
            type="number"
            min="0"
            step="0.01"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            className="mt-1 w-full border rounded px-3 py-2"
            required
          />
        </label>

        <label className="text-sm font-medium text-gray-700 block">
          Description
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={3}
            className="mt-1 w-full border rounded px-3 py-2"
          />
        </label>

        <section className="space-y-3">
          <h3 className="font-medium">Primary guest</h3>
          <div className="grid md:grid-cols-2 gap-3">
            <PartyTextField label="Email" required value={primary.email} onChange={handlePrimaryChange('email')} type="email" />
            <PartyTextField label="Phone" value={primary.phone} onChange={handlePrimaryChange('phone')} />
            <PartyTextField label="First name" value={primary.first_name} onChange={handlePrimaryChange('first_name')} />
            <PartyTextField label="Last name" value={primary.last_name} onChange={handlePrimaryChange('last_name')} />
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
                  <PartyTextField label="Email" required value={guest.email} onChange={handleAdditionalChange(index, 'email')} type="email" />
                  <PartyTextField label="Phone" value={guest.phone} onChange={handleAdditionalChange(index, 'phone')} />
                  <PartyTextField label="First name" value={guest.first_name} onChange={handleAdditionalChange(index, 'first_name')} />
                  <PartyTextField label="Last name" value={guest.last_name} onChange={handleAdditionalChange(index, 'last_name')} />
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

        <button type="submit" disabled={mutation.isLoading} className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-70">
          {mutation.isLoading ? 'Creating trip…' : 'Create trip'}
        </button>
      </form>
    </section>
  )
}

type TextFieldProps = {
  label: string
  value: string
  onChange: (value: string) => void
  required?: boolean
  placeholder?: string
}

function TextField({ label, value, onChange, required, placeholder }: TextFieldProps){
  return (
    <label className="text-sm font-medium text-gray-700 block">
      {label}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        placeholder={placeholder}
        className="mt-1 w-full border rounded px-3 py-2"
      />
    </label>
  )
}

type DateTimeFieldProps = {
  label: string
  value: string
  onChange: (value: string) => void
  required?: boolean
}

function DateTimeField({ label, value, onChange, required }: DateTimeFieldProps){
  return (
    <label className="text-sm font-medium text-gray-700 block">
      {label}
      <input
        type="datetime-local"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        className="mt-1 w-full border rounded px-3 py-2"
      />
    </label>
  )
}

type PartyTextFieldProps = {
  label: string
  value: string
  onChange: React.ChangeEventHandler<HTMLInputElement>
  required?: boolean
  type?: string
}

function PartyTextField({ label, value, onChange, required, type = 'text' }: PartyTextFieldProps){
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
