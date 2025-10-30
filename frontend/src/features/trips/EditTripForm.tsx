import { useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'

import { updateTrip } from './api'
import type { TripDetail, UpdateTripPayload } from './api'

type Props = {
  trip: TripDetail
  onClose: () => void
  onSaved: (trip: TripDetail) => void
}

const SINGLE_DAY = 'single_day'
const MULTI_DAY = 'multi_day'

export default function EditTripForm({ trip, onClose, onSaved }: Props){
  const initialTimingMode = trip.timing_mode
  const [title, setTitle] = useState(trip.title ?? '')
  const [location, setLocation] = useState(trip.location ?? '')
  const [timingMode, setTimingMode] = useState<'single_day' | 'multi_day'>(initialTimingMode)
  const [singleDayDate, setSingleDayDate] = useState(
    initialTimingMode === SINGLE_DAY ? formatDateInputValue(trip.start) : ''
  )
  const [singleDayStartTime, setSingleDayStartTime] = useState(
    initialTimingMode === SINGLE_DAY ? formatTimeInputValue(trip.start) : ''
  )
  const [singleDayDurationHours, setSingleDayDurationHours] = useState(
    initialTimingMode === SINGLE_DAY && trip.duration_hours ? String(trip.duration_hours) : ''
  )
  const [multiDayStart, setMultiDayStart] = useState(
    initialTimingMode === MULTI_DAY ? formatDateTimeInputValue(trip.start) : ''
  )
  const [multiDayDurationDays, setMultiDayDurationDays] = useState(
    initialTimingMode === MULTI_DAY && trip.duration_days ? String(trip.duration_days) : ''
  )
  const [price, setPrice] = useState(() => (trip.price_cents / 100).toFixed(2))
  const [description, setDescription] = useState(trip.description ?? '')
  const [notes, setNotes] = useState(trip.notes ?? '')
  const [targetGuestsPerGuide, setTargetGuestsPerGuide] = useState(
    trip.target_clients_per_guide ? String(trip.target_clients_per_guide) : ''
  )
  const [error, setError] = useState<string | null>(null)

  const hasTemplatePricing = useMemo(() => {
    const tiers = trip.pricing_snapshot?.tiers ?? []
    return Boolean(trip.template_id) || tiers.length > 1
  }, [trip])

  const mutation = useMutation({
    mutationFn: (payload: UpdateTripPayload) => updateTrip(trip.id, payload),
    onSuccess: (updatedTrip) => {
      setError(null)
      onSaved(updatedTrip)
    },
    onError: (err: any) => {
      const detail = err?.response?.data?.detail || err?.message || 'Unable to update trip.'
      setError(String(detail))
    }
  })

  const handleTimingModeChange = (mode: 'single_day' | 'multi_day') => {
    setTimingMode(mode)
    if (mode === SINGLE_DAY) {
      setMultiDayStart('')
      setMultiDayDurationDays('')
      if (!singleDayDurationHours && trip.duration_hours){
        setSingleDayDurationHours(String(trip.duration_hours))
      }
    } else {
      setSingleDayDate('')
      setSingleDayStartTime('')
      setSingleDayDurationHours('')
      if (!multiDayDurationDays && trip.duration_days){
        setMultiDayDurationDays(String(trip.duration_days))
      }
      if (!multiDayStart){
        setMultiDayStart(formatDateTimeInputValue(trip.start))
      }
    }
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

    if (!location.trim()) {
      setError('Trip location is required.')
      return
    }

    let startIso: string | null = null
    let durationHours: number | undefined
    let durationDays: number | undefined

    if (timingMode === SINGLE_DAY) {
      if (!singleDayDate || !singleDayStartTime) {
        setError('Select a date and start time for single-day trips.')
        return
      }
      const hoursNumber = Number(singleDayDurationHours)
      if (!singleDayDurationHours.trim() || Number.isNaN(hoursNumber) || hoursNumber <= 0) {
        setError('Duration (hours) must be greater than zero for single-day trips.')
        return
      }
      durationHours = Math.round(hoursNumber)
      const startDateTime = new Date(`${singleDayDate}T${singleDayStartTime}`)
      if (Number.isNaN(startDateTime.getTime())) {
        setError('Unable to parse the start date/time for this trip.')
        return
      }
      startIso = startDateTime.toISOString()
    } else {
      if (!multiDayStart) {
        setError('Select a start date and time for multi-day trips.')
        return
      }
      const daysNumber = Number(multiDayDurationDays)
      if (!multiDayDurationDays.trim() || Number.isNaN(daysNumber) || daysNumber <= 0) {
        setError('Duration (days) must be at least one for multi-day trips.')
        return
      }
      durationDays = Math.round(daysNumber)
      const startDateTime = new Date(multiDayStart)
      if (Number.isNaN(startDateTime.getTime())) {
        setError('Unable to parse the start date/time for this trip.')
        return
      }
      startIso = startDateTime.toISOString()
    }

    if (!startIso) {
      setError('Start time is required.')
      return
    }

    const payload: UpdateTripPayload = {
      title: title.trim(),
      location: location.trim(),
      start: startIso,
      description: description.trim(),
      notes: notes.trim(),
      timing_mode: timingMode,
    }

    if (timingMode === SINGLE_DAY && durationHours !== undefined) {
      payload.duration_hours = durationHours
      payload.duration_days = undefined
    }
    if (timingMode === MULTI_DAY && durationDays !== undefined) {
      payload.duration_days = durationDays
      payload.duration_hours = undefined
    }

    if (!hasTemplatePricing) {
      const priceNumber = Number(price)
      if (Number.isNaN(priceNumber) || priceNumber <= 0) {
        setError('Price must be greater than zero.')
        return
      }
      payload.price_cents = Math.round(priceNumber * 100)
    }

    const ratioValue = targetGuestsPerGuide.trim()
    if (ratioValue) {
      const ratioNumber = Number(ratioValue)
      if (Number.isNaN(ratioNumber) || ratioNumber <= 0) {
        setError('Target guests per guide must be greater than zero if provided.')
        return
      }
      payload.target_clients_per_guide = ratioNumber
    } else if (trip.target_clients_per_guide !== null) {
      payload.target_clients_per_guide = null
    }

    mutation.mutate(payload)
  }

  const saving = mutation.isPending

  return (
    <section className="space-y-6 rounded-lg border bg-white p-6 shadow-md max-h-[85vh] overflow-y-auto">
      <header className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Edit trip</h2>
        <button
          type="button"
          onClick={onClose}
          className="text-sm text-gray-600 underline"
        >
          Close
        </button>
      </header>

      <form className="space-y-6" onSubmit={handleSubmit}>
        <div className="grid gap-4 md:grid-cols-2">
          <TextField label="Trip title" value={title} onChange={setTitle} />
          <TextField label="Location" value={location} onChange={setLocation} required />
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-gray-700">Trip length</legend>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
            <label className="inline-flex items-center gap-2 text-sm text-gray-700">
              <input
                type="radio"
                name="edit-timing-mode"
                value={SINGLE_DAY}
                checked={timingMode === SINGLE_DAY}
                onChange={() => handleTimingModeChange(SINGLE_DAY)}
              />
              Single day
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-gray-700">
              <input
                type="radio"
                name="edit-timing-mode"
                value={MULTI_DAY}
                checked={timingMode === MULTI_DAY}
                onChange={() => handleTimingModeChange(MULTI_DAY)}
              />
              Multi day
            </label>
          </div>
        </fieldset>

        {timingMode === SINGLE_DAY ? (
          <div className="grid gap-4 md:grid-cols-3">
            <label className="block text-sm font-medium text-gray-700">
              Trip date
              <input
                type="date"
                value={singleDayDate}
                onChange={(event) => setSingleDayDate(event.target.value)}
                className="mt-1 w-full rounded border px-3 py-2"
                required
              />
            </label>
            <label className="block text-sm font-medium text-gray-700">
              Start time
              <input
                type="time"
                value={singleDayStartTime}
                onChange={(event) => setSingleDayStartTime(event.target.value)}
                className="mt-1 w-full rounded border px-3 py-2"
                required
              />
            </label>
            <label className="block text-sm font-medium text-gray-700">
              Duration (hours)
              <input
                type="number"
                min={1}
                value={singleDayDurationHours}
                onChange={(event) => setSingleDayDurationHours(event.target.value)}
                className="mt-1 w-full rounded border px-3 py-2"
                required
              />
            </label>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            <DateTimeField label="Start" value={multiDayStart} onChange={setMultiDayStart} required />
            <TextField
              label="Duration (days)"
              value={multiDayDurationDays}
              onChange={setMultiDayDurationDays}
              type="number"
              min={1}
              required
            />
          </div>
        )}

        <div>
          <TextField
            label="Target guests per guide (optional)"
            value={targetGuestsPerGuide}
            onChange={setTargetGuestsPerGuide}
            type="number"
            min={1}
          />
          <p className="mt-1 text-xs text-gray-500">
            Guides use this to plan staffing; it&apos;s a goal, not a hard requirement.
          </p>
        </div>

        <label className="block text-sm font-medium text-gray-700">
          Price (USD)
          <input
            type="number"
            min="0"
            step="0.01"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            className="mt-1 w-full rounded border px-3 py-2"
            disabled={hasTemplatePricing}
            required={!hasTemplatePricing}
          />
          {hasTemplatePricing && (
            <span className="mt-1 block text-xs text-gray-500">
              Pricing comes from the saved tiers for this trip. Update the template to change per-guest rates.
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

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-70"
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="text-sm underline text-gray-600"
          >
            Cancel
          </button>
        </div>
      </form>
    </section>
  )
}

type TextFieldProps = {
  label: string
  value: string
  onChange: (value: string) => void
  required?: boolean
  type?: string
  min?: number
}

function TextField({ label, value, onChange, required, type = 'text', min }: TextFieldProps){
  return (
    <label className="block text-sm font-medium text-gray-700">
      {label}
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
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

function formatDateInputValue(iso: string): string{
  if (!iso) return ''
  const date = new Date(iso)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatTimeInputValue(iso: string): string{
  if (!iso) return ''
  const date = new Date(iso)
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${hours}:${minutes}`
}

function formatDateTimeInputValue(iso: string): string{
  if (!iso) return ''
  const date = new Date(iso)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day}T${hours}:${minutes}`
}
