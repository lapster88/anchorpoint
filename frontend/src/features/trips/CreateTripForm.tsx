import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  createTrip,
  CreateTripPayload,
  TripDetail,
  listServiceGuides,
  GuideOption,
  listServiceTripTemplates,
  TripTemplateOption
} from './api'
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
  const [description, setDescription] = useState('')
  const [durationHours, setDurationHours] = useState('')
  const [targetClients, setTargetClients] = useState('')
  const [targetGuides, setTargetGuides] = useState('')
  const [notes, setNotes] = useState('')
  const [guides, setGuides] = useState<GuideOption[]>([])
  const [selectedGuideIds, setSelectedGuideIds] = useState<number[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('')

  const [primary, setPrimary] = useState<GuestForm>(emptyGuest)
  const [additionalGuests, setAdditionalGuests] = useState<GuestForm[]>([])
  const [partySize, setPartySize] = useState<number | ''>('')
  const [error, setError] = useState<string | null>(null)
  const manualPriceRef = useRef<string>('')
  const prevTemplateIdRef = useRef<string>('')

  const templatesQuery = useQuery({
    queryKey: ['trip-templates', serviceId],
    queryFn: () => listServiceTripTemplates(serviceId!),
    enabled: Boolean(serviceId)
  })

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

  const templates = templatesQuery.data ?? []
  const selectedTemplate = useMemo(
    () => templates.find((template) => String(template.id) === selectedTemplateId),
    [templates, selectedTemplateId]
  )

  const mutationInFlight = mutation.isLoading
  const hasTemplatePricing = Boolean(selectedTemplate)
  const priceInputDisabled = hasTemplatePricing

  const calculatedPartySize = useMemo(() => {
    const base = 1 + additionalGuests.filter((guest) => guest.email.trim()).length
    if (partySize === '') return base
    return Math.max(base, Number(partySize))
  }, [additionalGuests, partySize])

  const handlePrimaryChange = (field: keyof GuestForm) => (event: React.ChangeEvent<HTMLInputElement>) => {
    setPrimary((prev) => ({ ...prev, [field]: event.target.value }))
  }

  const handleAdditionalChange = (index: number, field: keyof GuestForm) => (event: React.ChangeEvent<HTMLInputElement>) => {
    setAdditionalGuests((prev) =>
      prev.map((guest, i) => (i === index ? { ...guest, [field]: event.target.value } : guest))
    )
  }

  const addAdditionalGuest = () => setAdditionalGuests((prev) => [...prev, emptyGuest])
  const removeAdditionalGuest = (index: number) =>
    setAdditionalGuests((prev) => prev.filter((_, i) => i !== index))

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
    if (!hasTemplatePricing) {
      if (Number.isNaN(priceNumber) || priceNumber <= 0) {
        setError('Price must be greater than zero.')
        return
      }
    }

    const extraGuests = additionalGuests
      .filter((guest) => guest.email.trim())
      .map((guest) => ({ ...guest }))

    const partyPayload: CreatePartyPayload = {
      primary_guest: { ...primary },
      additional_guests: extraGuests.length ? extraGuests : undefined,
      party_size: typeof partySize === 'number' ? partySize : undefined
    }

    const computedTitle =
      title.trim() ||
      [primary.first_name, primary.last_name].filter(Boolean).join(' ').trim() ||
      primary.email.trim() ||
      'Private Trip'

    const payload: CreateTripPayload = {
      guide_service: serviceId,
      title: computedTitle,
      location: location.trim(),
      start: new Date(start).toISOString(),
      end: new Date(end).toISOString(),
      description: description.trim() || undefined,
      guides: selectedGuideIds,
      party: partyPayload
    }

    if (selectedTemplate) {
      payload.template = selectedTemplate.id
    }
    if (!selectedTemplate && durationHours.trim()) {
      payload.duration_hours = Number(durationHours)
    } else if (selectedTemplate) {
      payload.duration_hours = selectedTemplate.duration_hours
    }
    if (!selectedTemplate && targetClients.trim()) {
      payload.target_client_count = Number(targetClients)
    } else if (selectedTemplate) {
      payload.target_client_count = selectedTemplate.target_client_count
    }
    if (!selectedTemplate && targetGuides.trim()) {
      payload.target_guide_count = Number(targetGuides)
    } else if (selectedTemplate) {
      payload.target_guide_count = selectedTemplate.target_guide_count
    }
    if (notes.trim()) {
      payload.notes = notes.trim()
    }
    if (!hasTemplatePricing) {
      payload.price_cents = Math.round(priceNumber * 100)
    }

    mutation.mutate(payload)
  }

  useEffect(() => {
    let active = true
    if (!serviceId) {
      setGuides([])
      setSelectedGuideIds([])
      setSelectedTemplateId('')
      setDurationHours('')
      setTargetClients('')
      setTargetGuides('')
      setNotes('')
      setPrice('')
      manualPriceRef.current = ''
      return () => {
        active = false
      }
    }

    listServiceGuides(serviceId)
      .then((data) => {
        if (!active) return
        setGuides(data)
        setSelectedGuideIds((prev) => prev.filter((id) => data.some((guide) => guide.id === id)))
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

  useEffect(() => {
    if (!selectedTemplate) {
      if (prevTemplateIdRef.current) {
        prevTemplateIdRef.current = ''
      }
      setPrice(manualPriceRef.current || '')
      return
    }
    if (prevTemplateIdRef.current === selectedTemplateId) {
      return
    }
    prevTemplateIdRef.current = selectedTemplateId
    setTitle(selectedTemplate.title)
    setLocation(selectedTemplate.location)
    setDurationHours(String(selectedTemplate.duration_hours || ''))
    setTargetClients(String(selectedTemplate.target_client_count || ''))
    setTargetGuides(String(selectedTemplate.target_guide_count || ''))
    setNotes(selectedTemplate.notes || '')
  }, [selectedTemplate, selectedTemplateId])

  useEffect(() => {
    if (!hasTemplatePricing) {
      manualPriceRef.current = price
      return
    }
    if (!selectedTemplate) {
      return
    }
    const nextPrice = selectTemplateRate(selectedTemplate, calculatedPartySize)
    if (nextPrice !== price) {
      setPrice(nextPrice)
    }
  }, [calculatedPartySize, hasTemplatePricing, price, selectedTemplate])

  if (!serviceId) {
    return (
      <section className="space-y-4 rounded-lg border bg-white p-6 shadow-md">
        <header className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Create trip</h2>
          <button type="button" onClick={onClose} className="text-sm text-gray-600 underline">
            Close
          </button>
        </header>
        <p className="text-sm text-gray-600">
          You don&apos;t have an active guide service selected. Switch services to create a trip.
        </p>
      </section>
    )
  }

  return (
    <section className="space-y-6 rounded-lg border bg-white p-6 shadow-md">
      <header className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Create trip</h2>
        <button type="button" onClick={onClose} className="text-sm text-gray-600 underline">
          Close
        </button>
      </header>

      <form className="space-y-6" onSubmit={handleSubmit}>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500">Guide service</p>
            <p className="mt-1 text-sm text-gray-700">{serviceName || 'Unavailable'}</p>
          </div>
        </div>

        <label className="block text-sm font-medium text-gray-700">
          Template
          <select
            className="mt-1 w-full rounded border px-3 py-2"
            value={selectedTemplateId}
            onChange={(event) => {
              const value = event.target.value
              setSelectedTemplateId(value)
              if (!value) {
                setDurationHours('')
                setTargetClients('')
                setTargetGuides('')
                setNotes('')
                if (manualPriceRef.current){
                  setPrice(manualPriceRef.current)
                }
              }
            }}
          >
            <option value="">Custom trip</option>
            {templates
              .filter((template) => template.is_active)
              .map((template) => (
                <option key={template.id} value={String(template.id)}>
                  {template.title}
                </option>
              ))}
          </select>
          {templatesQuery.isLoading && (
            <span className="mt-1 block text-xs text-gray-500">Loading templates…</span>
          )}
          {selectedTemplate && selectedTemplate.notes && (
            <span className="mt-1 block text-xs text-gray-500">
              Template notes: {selectedTemplate.notes}
            </span>
          )}
        </label>

        <div className="grid gap-4 md:grid-cols-2">
          <TextField
            label="Trip title (optional)"
            value={title}
            onChange={setTitle}
            placeholder="Defaults to primary guest name"
          />
          <TextField label="Location" value={location} onChange={setLocation} required />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <DateTimeField label="Start" value={start} onChange={setStart} required />
          <DateTimeField label="End" value={end} onChange={setEnd} required />
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <TextField
            label="Duration (hours)"
            value={durationHours}
            onChange={setDurationHours}
            required={!selectedTemplate}
            type="number"
            min={1}
          />
          <TextField
            label="Clients per trip"
            value={targetClients}
            onChange={setTargetClients}
            required={!selectedTemplate}
            type="number"
            min={1}
          />
          <TextField
            label="Guides per trip"
            value={targetGuides}
            onChange={setTargetGuides}
            required={!selectedTemplate}
            type="number"
            min={1}
          />
        </div>

        {selectedTemplate && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
            <p className="font-medium text-slate-800">Pricing preview</p>
            <PricingTiers tiers={selectedTemplate.pricing_tiers} currency={selectedTemplate.pricing_currency} />
          </div>
        )}

        <label className="block text-sm font-medium text-gray-700">
          Price (USD)
          <input
            type="number"
            min="0"
            step="0.01"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            className="mt-1 w-full rounded border px-3 py-2"
            disabled={priceInputDisabled}
          required={!hasTemplatePricing}
          />
          {hasTemplatePricing && (
            <span className="mt-1 block text-xs text-gray-500">
              Pricing is based on the selected template tiers.
            </span>
          )}
        </label>

        <label className="block text-sm font-medium text-gray-700">
          Description
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={3}
            className="mt-1 w-full rounded border px-3 py-2"
          />
        </label>

        <label className="block text-sm font-medium text-gray-700">
          Notes for guides (optional)
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={3}
            className="mt-1 w-full rounded border px-3 py-2"
          />
        </label>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-700">Assigned guides (optional)</p>
            {!guides.length && (
              <span className="text-xs text-gray-500">No active guides for this service.</span>
            )}
          </div>
          <div className="space-y-2">
            {guides.map((guide) => {
              const name =
                guide.display_name ||
                [guide.first_name, guide.last_name].filter(Boolean).join(' ').trim() ||
                guide.email
              const isChecked = selectedGuideIds.includes(guide.id)
              return (
                <label key={guide.id} className="inline-flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={isChecked}
                    onChange={(event) => {
                      setSelectedGuideIds((prev) =>
                        event.target.checked ? [...prev, guide.id] : prev.filter((id) => id !== guide.id)
                      )
                    }}
                  />
                  <span>{name}</span>
                </label>
              )
            })}
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="font-medium">Primary guest</h3>
          <div className="grid gap-3 md:grid-cols-2">
            <PartyTextField
              label="Email"
              required
              value={primary.email}
              onChange={handlePrimaryChange('email')}
              type="email"
            />
            <PartyTextField label="Phone" value={primary.phone} onChange={handlePrimaryChange('phone')} />
            <PartyTextField
              label="First name"
              value={primary.first_name}
              onChange={handlePrimaryChange('first_name')}
            />
            <PartyTextField
              label="Last name"
              value={primary.last_name}
              onChange={handlePrimaryChange('last_name')}
            />
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-medium">Additional guests</h3>
            <button type="button" className="text-sm text-blue-600 underline" onClick={addAdditionalGuest}>
              Add guest
            </button>
          </div>
          {additionalGuests.length === 0 && (
            <p className="text-sm text-gray-500">No additional guests yet.</p>
          )}
          <div className="space-y-3">
            {additionalGuests.map((guest, index) => (
              <div key={index} className="rounded border px-3 py-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <PartyTextField
                    label="Email"
                    required
                    value={guest.email}
                    onChange={handleAdditionalChange(index, 'email')}
                    type="email"
                  />
                  <PartyTextField
                    label="Phone"
                    value={guest.phone}
                    onChange={handleAdditionalChange(index, 'phone')}
                  />
                  <PartyTextField
                    label="First name"
                    value={guest.first_name}
                    onChange={handleAdditionalChange(index, 'first_name')}
                  />
                  <PartyTextField
                    label="Last name"
                    value={guest.last_name}
                    onChange={handleAdditionalChange(index, 'last_name')}
                  />
                </div>
                <div className="mt-2 text-right">
                  <button
                    type="button"
                    className="text-xs text-red-600 underline"
                    onClick={() => removeAdditionalGuest(index)}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">
            Party size
            <input
              type="number"
              min={1}
              value={partySize}
              onChange={(event) => setPartySize(event.target.value === '' ? '' : Number(event.target.value))}
              className="mt-1 w-full rounded border px-3 py-2"
            />
          </label>
          <p className="text-xs text-gray-500">Calculated minimum based on guests: {calculatedPartySize}</p>
        </section>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={mutationInFlight}
          className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-70"
        >
          {mutationInFlight ? 'Creating trip…' : 'Create trip'}
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
  type?: string
  min?: number
}

function TextField({ label, value, onChange, required, placeholder, type = 'text', min }: TextFieldProps){
  return (
    <label className="block text-sm font-medium text-gray-700">
      {label}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        placeholder={placeholder}
        type={type}
        min={min}
        className="mt-1 w-full rounded border px-3 py-2"
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
    <label className="block text-sm font-medium text-gray-700">
      {label}
      <input
        type="datetime-local"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        className="mt-1 w-full rounded border px-3 py-2"
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
    <label className="block text-sm font-medium text-gray-700">
      <span>
        {label}
        {required ? ' *' : ''}
      </span>
      <input
        type={type}
        value={value}
        onChange={onChange}
        required={required}
        className="mt-1 w-full rounded border px-3 py-2"
      />
    </label>
  )
}

type PricingTiersProps = {
  tiers: TripTemplateOption['pricing_tiers']
  currency: string
}

function PricingTiers({ tiers, currency }: PricingTiersProps){
  if (!tiers.length){
    return <p className="text-xs text-slate-500">No tiers configured.</p>
  }
  return (
    <dl className="mt-2 space-y-1">
      {tiers.map((tier, index) => (
        <div
          key={`${tier.min_guests}-${tier.max_guests ?? 'open'}-${index}`}
          className="flex items-center justify-between rounded border border-slate-200 bg-white px-3 py-2"
        >
          <dt className="text-xs text-slate-500">
            {tier.max_guests === null
              ? `${tier.min_guests}+ guests`
              : `${tier.min_guests} – ${tier.max_guests} guests`}
          </dt>
          <dd className="text-sm font-medium text-slate-800">
            {formatCurrency(tier.price_per_guest, currency)} per guest
          </dd>
        </div>
      ))}
    </dl>
  )
}

function formatCurrency(value: string, currency: string){
  const amount = Number(value)
  if (!Number.isFinite(amount)){
    return value
  }
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: (currency || 'usd').toUpperCase(),
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount)
}

function selectTemplateRate(template: TripTemplateOption, partySize: number): string{
  const tiers = template.pricing_tiers ?? []
  if (!tiers.length){
    return ''
  }

  const normalizedSize = Number.isFinite(partySize) && partySize > 0 ? partySize : 1
  const matchingTier = tiers.find((tier) => tier.max_guests === null || normalizedSize <= tier.max_guests)
  const resolvedTier = matchingTier ?? tiers[tiers.length - 1]
  const price = resolvedTier?.price_per_guest
  return price === undefined || price === null ? '' : String(price)
}
