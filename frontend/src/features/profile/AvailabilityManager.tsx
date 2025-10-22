import { ChangeEvent, FormEvent, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  GuideAvailability,
  AvailabilityShare,
  ServiceMembership,
  AvailabilityInput,
  fetchAvailabilities,
  fetchAvailabilityShares,
  fetchMemberships,
  createAvailability,
  updateAvailability,
  deleteAvailability,
  addAvailabilityShare,
  removeAvailabilityShare
} from './api'

// Visible values for both manual form entries and row edits; keep in sync with backend choices.
const visibilityOptions = [
  { value: 'private', label: 'Private' },
  { value: 'busy', label: 'Busy Only' },
  { value: 'detail', label: 'Show Details' }
] as const

type FormState = {
  start: string
  end: string
  guide_service: string
  is_available: boolean
  visibility: 'private' | 'busy' | 'detail'
  note: string
}

const initialForm: FormState = {
  start: '',
  end: '',
  guide_service: '',
  is_available: false,
  visibility: 'busy',
  note: ''
}

function isoFromLocal(input: string): string {
  return new Date(input).toISOString()
}

function formatDate(date: string): string {
  return new Date(date).toLocaleString()
}

type AvailabilityRowProps = {
  availability: GuideAvailability
  memberships: ServiceMembership[]
  onUpdate: (id: number, payload: Partial<AvailabilityInput>) => void
  onDelete: (id: number) => void
}

function AvailabilityRow({ availability, memberships, onUpdate, onDelete }: AvailabilityRowProps) {
  const [visibility, setVisibility] = useState(availability.visibility)
  const [note, setNote] = useState(availability.note || '')
  const [isAvailable, setIsAvailable] = useState(availability.is_available)
  const [saving, setSaving] = useState(false)
  const queryClient = useQueryClient()
  const sharesQueryKey = useMemo(() => ['availability-shares', availability.id], [availability.id])

  const { data: shares } = useQuery({
    queryKey: sharesQueryKey,
    queryFn: () => fetchAvailabilityShares(availability.id)
  })

  const shareMutation = useMutation({
    mutationFn: (payload: { guide_service: number; visibility: 'private' | 'busy' | 'detail' }) =>
      addAvailabilityShare(availability.id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sharesQueryKey })
    }
  })

  const shareDeleteMutation = useMutation({
    mutationFn: (guideServiceId: number) => removeAvailabilityShare(availability.id, guideServiceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sharesQueryKey })
    }
  })

  const [shareServiceId, setShareServiceId] = useState('')
  const [shareVisibility, setShareVisibility] = useState<'private' | 'busy' | 'detail'>('busy')

  const availableMembershipOptions = memberships.filter(
    membership => !shares?.some(share => share.guide_service === membership.guide_service)
  )

  const handleSave = async () => {
    setSaving(true)
    await onUpdate(availability.id, {
      visibility,
      note,
      is_available: isAvailable
    })
    setSaving(false)
  }

  const handleAddShare = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!shareServiceId) return
    await shareMutation.mutateAsync({ guide_service: Number(shareServiceId), visibility: shareVisibility })
    setShareServiceId('')
    setShareVisibility('busy')
  }

  return (
    <div className="border rounded p-4 space-y-3" data-testid={`availability-row-${availability.id}`}>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <div>
          <p className="font-medium">{formatDate(availability.start)} → {formatDate(availability.end)}</p>
          <p className="text-sm text-gray-600">
            Source: {availability.source_display} {availability.trip_title ? `· ${availability.trip_title}` : ''}
          </p>
          {availability.guide_service_name && (
            <p className="text-sm text-gray-600">Service: {availability.guide_service_name}</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isAvailable}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setIsAvailable(event.target.checked)}
            />
            Available
          </label>
          <select
            value={visibility}
            onChange={(event: ChangeEvent<HTMLSelectElement>) =>
              setVisibility(event.target.value as 'private' | 'busy' | 'detail')
            }
            className="border rounded px-2 py-1 text-sm"
          >
            {visibilityOptions.map(option => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <button
            type="button"
            className="text-sm text-red-600 underline"
            onClick={() => onDelete(availability.id)}
          >
            Delete
          </button>
        </div>
      </div>
      <div className="space-y-2">
        <label className="block text-sm font-medium">Note</label>
        <input
          type="text"
          value={note}
          onChange={(event: ChangeEvent<HTMLInputElement>) => setNote(event.target.value)}
          className="w-full border rounded px-3 py-2"
          placeholder="Optional context"
        />
      </div>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-70"
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
      <div className="border-t pt-4 space-y-3">
        <p className="text-sm font-semibold">Visibility Overrides</p>
        <form className="flex flex-col md:flex-row gap-2 md:items-center" onSubmit={handleAddShare}>
          <select
            value={shareServiceId}
            onChange={(event: ChangeEvent<HTMLSelectElement>) => setShareServiceId(event.target.value)}
            className="border rounded px-2 py-1 text-sm"
          >
            <option value="">Select service</option>
            {availableMembershipOptions.map(membership => (
              <option key={membership.id} value={membership.guide_service}>
                {membership.guide_service_name}
              </option>
            ))}
          </select>
          <select
            value={shareVisibility}
            onChange={(event: ChangeEvent<HTMLSelectElement>) =>
              setShareVisibility(event.target.value as 'private' | 'busy' | 'detail')
            }
            className="border rounded px-2 py-1 text-sm"
          >
            {visibilityOptions.map(option => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <button
            type="submit"
            className="bg-slate-800 text-white px-3 py-1 rounded text-sm disabled:opacity-70"
            disabled={!shareServiceId || shareMutation.isLoading}
          >
            Add
          </button>
        </form>
        <ul className="space-y-1">
          {shares?.map((share: AvailabilityShare) => (
            <li key={share.id} className="flex items-center justify-between text-sm">
              <span>{share.guide_service_name} — {visibilityOptions.find(opt => opt.value === share.visibility)?.label}</span>
              <button
                type="button"
                className="text-red-600 underline"
                onClick={() => shareDeleteMutation.mutate(share.guide_service)}
              >
                Remove
              </button>
            </li>
          )) || <li className="text-sm text-gray-600">No overrides</li>}
        </ul>
      </div>
    </div>
  )
}

export default function AvailabilityManager() {
  const queryClient = useQueryClient()
  const { data: availabilities, isLoading } = useQuery({ queryKey: ['availabilities'], queryFn: fetchAvailabilities })
  const { data: memberships } = useQuery({ queryKey: ['memberships'], queryFn: fetchMemberships })
  const createMutation = useMutation({
    mutationFn: (payload: AvailabilityInput) => createAvailability(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['availabilities'] })
      setForm(initialForm)
      setMessage('Availability added')
      window.setTimeout(() => setMessage(null), 2500)
    }
  })
  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<AvailabilityInput> }) => updateAvailability(id, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['availabilities'] })
  })
  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteAvailability(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['availabilities'] })
  })

  const [form, setForm] = useState<FormState>(initialForm)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleChange = (field: keyof FormState) => (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const value = event.target.type === 'checkbox'
      ? (event.target as HTMLInputElement).checked
      : event.target.value
    setForm(prev => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    try {
      const payload: AvailabilityInput = {
        start: isoFromLocal(form.start),
        end: isoFromLocal(form.end),
        is_available: form.is_available,
        visibility: form.visibility,
        note: form.note || undefined,
        guide_service: form.guide_service ? Number(form.guide_service) : null
      }
      await createMutation.mutateAsync(payload)
    } catch (err: any) {
      const detail = err?.response?.data?.detail || err?.message || 'Unable to create availability.'
      setError(String(detail))
    }
  }

  const handleUpdate = async (id: number, payload: Partial<AvailabilityInput>) => {
    setError(null)
    try {
      await updateMutation.mutateAsync({ id, payload })
    } catch (err: any) {
      const detail = err?.response?.data?.detail || err?.message || 'Unable to update availability.'
      setError(String(detail))
    }
  }

  const handleDelete = async (id: number) => {
    setError(null)
    if (!window.confirm('Delete this availability slot?')) return
    try {
      await deleteMutation.mutateAsync(id)
    } catch (err: any) {
      const detail = err?.response?.data?.detail || err?.message || 'Unable to delete availability.'
      setError(String(detail))
    }
  }

  return (
    <section className="space-y-4">
      <div>
        <h3 className="text-xl font-semibold">Availability</h3>
        <p className="text-sm text-gray-600">Manage when you are free or busy across all services.</p>
      </div>
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="block text-sm font-medium">Start</label>
            <input
              type="datetime-local"
              required
              value={form.start}
              onChange={handleChange('start')}
              className="w-full border rounded px-3 py-2"
            />
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-medium">End</label>
            <input
              type="datetime-local"
              required
              value={form.end}
              onChange={handleChange('end')}
              className="w-full border rounded px-3 py-2"
            />
          </div>
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <label className="block text-sm font-medium">Visibility</label>
            <select
              value={form.visibility}
              onChange={handleChange('visibility')}
              className="w-full border rounded px-3 py-2"
            >
              {visibilityOptions.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-medium">Guide service (optional)</label>
            <select
              value={form.guide_service}
              onChange={handleChange('guide_service')}
              className="w-full border rounded px-3 py-2"
            >
              <option value="">Not specific</option>
              {memberships?.map(membership => (
                <option key={membership.id} value={membership.guide_service}>
                  {membership.guide_service_name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-medium">Status</label>
            <label className="flex items-center gap-2 text-sm border rounded px-3 py-2">
              <input
                type="checkbox"
                checked={form.is_available}
                onChange={handleChange('is_available')}
              />
              Available
            </label>
          </div>
        </div>
        <div className="space-y-2">
          <label className="block text-sm font-medium">Note</label>
          <input
            type="text"
            value={form.note}
            onChange={handleChange('note')}
            className="w-full border rounded px-3 py-2"
            placeholder="Optional context"
          />
        </div>
        {error && <div className="text-sm text-red-600">{error}</div>}
        {message && <div className="text-sm text-green-600">{message}</div>}
        <button
          type="submit"
          className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-70"
          disabled={createMutation.isLoading}
        >
          {createMutation.isLoading ? 'Adding…' : 'Add availability'}
        </button>
      </form>
      <div className="space-y-3">
        <h4 className="text-lg font-semibold">Existing Availability</h4>
        {isLoading && <p>Loading…</p>}
        {!isLoading && (!availabilities || availabilities.length === 0) && (
          <p className="text-sm text-gray-600">No availability slots yet.</p>
        )}
        <div className="space-y-4">
          {availabilities?.map(item => (
            <AvailabilityRow
              key={item.id}
              availability={item}
              memberships={memberships || []}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
            />
          ))}
        </div>
      </div>
    </section>
  )
}
