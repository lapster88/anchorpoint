import { ChangeEvent, FormEvent, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CalendarIntegration,
  createCalendarIntegration,
  deleteCalendarIntegration,
  fetchCalendarIntegrations,
  updateCalendarIntegration
} from './api'

const providerOptions = [
  { value: 'google', label: 'Google Calendar' },
  { value: 'outlook', label: 'Outlook / Office365' },
  { value: 'apple', label: 'Apple Calendar' },
  { value: 'custom', label: 'Custom iCal' }
] as const

type IntegrationFormState = {
  provider: string
  external_id: string
  is_active: boolean
  sync_config: string
}

const initialIntegrationForm: IntegrationFormState = {
  provider: 'google',
  external_id: '',
  is_active: true,
  sync_config: '{}'
}

type IntegrationRowProps = {
  integration: CalendarIntegration
  onUpdate: (id: number, payload: Partial<CalendarIntegration>) => Promise<void>
  onDelete: (id: number) => Promise<void>
}

function IntegrationRow({ integration, onUpdate, onDelete }: IntegrationRowProps) {
  const [externalId, setExternalId] = useState(integration.external_id)
  const [isActive, setIsActive] = useState(integration.is_active)
  const [configText, setConfigText] = useState(JSON.stringify(integration.sync_config || {}, null, 2))
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      const parsedConfig = configText ? JSON.parse(configText) : {}
      await onUpdate(integration.id, {
        external_id: externalId,
        is_active: isActive,
        sync_config: parsedConfig as Record<string, unknown>
      })
    } catch (err) {
      console.error('Failed to parse sync config', err)
      alert('Sync config must be valid JSON.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="border rounded p-4 space-y-3">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <div>
          <p className="font-medium">{integration.provider_display}</p>
          {integration.last_synced_at && (
            <p className="text-sm text-gray-600">Last synced {new Date(integration.last_synced_at).toLocaleString()}</p>
          )}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setIsActive(event.target.checked)}
          />
          Active
        </label>
      </div>
      <div className="space-y-2">
        <label className="block text-sm font-medium">External calendar ID</label>
        <input
          type="text"
          value={externalId}
          onChange={(event: ChangeEvent<HTMLInputElement>) => setExternalId(event.target.value)}
          className="w-full border rounded px-3 py-2"
          placeholder="Calendar identifier (if applicable)"
        />
      </div>
      <div className="space-y-2">
        <label className="block text-sm font-medium">Sync configuration (JSON)</label>
        <textarea
          value={configText}
          onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setConfigText(event.target.value)}
          className="w-full border rounded px-3 py-2 font-mono text-sm"
          rows={4}
        />
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-70"
        >
          {saving ? 'Saving…' : 'Save integration'}
        </button>
        <button
          type="button"
          className="text-red-600 underline"
          onClick={() => onDelete(integration.id)}
        >
          Remove
        </button>
      </div>
    </div>
  )
}

export default function CalendarIntegrationManager() {
  const queryClient = useQueryClient()
  const { data: integrations, isLoading } = useQuery({
    queryKey: ['calendar-integrations'],
    queryFn: fetchCalendarIntegrations
  })

  const [form, setForm] = useState<IntegrationFormState>(initialIntegrationForm)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const createMutation = useMutation({
    mutationFn: () =>
      createCalendarIntegration({
        provider: form.provider,
        external_id: form.external_id,
        is_active: form.is_active,
        sync_config: form.sync_config ? JSON.parse(form.sync_config) : {}
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar-integrations'] })
      setForm(initialIntegrationForm)
      setMessage('Integration added')
      window.setTimeout(() => setMessage(null), 2500)
    }
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<CalendarIntegration> }) =>
      updateCalendarIntegration(id, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['calendar-integrations'] })
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteCalendarIntegration(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['calendar-integrations'] })
  })

  const handleChange = (field: keyof IntegrationFormState) => (
    event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const value = event.target.type === 'checkbox'
      ? (event.target as HTMLInputElement).checked
      : event.target.value
    setForm(prev => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    try {
      await createMutation.mutateAsync()
    } catch (err: any) {
      const detail = err?.response?.data?.detail || err?.message || 'Unable to create integration.'
      setError(String(detail))
    }
  }

  const handleUpdate = async (id: number, payload: Partial<CalendarIntegration>) => {
    setError(null)
    try {
      await updateMutation.mutateAsync({ id, payload })
    } catch (err: any) {
      const detail = err?.response?.data?.detail || err?.message || 'Unable to update integration.'
      setError(String(detail))
    }
  }

  const handleDelete = async (id: number) => {
    setError(null)
    if (!window.confirm('Remove this integration?')) return
    try {
      await deleteMutation.mutateAsync(id)
    } catch (err: any) {
      const detail = err?.response?.data?.detail || err?.message || 'Unable to remove integration.'
      setError(String(detail))
    }
  }

  return (
    <section className="space-y-4">
      <div>
        <h3 className="text-xl font-semibold">Calendar Integrations</h3>
        <p className="text-sm text-gray-600">Connect external calendars to keep availability in sync.</p>
      </div>
      <form className="space-y-3" onSubmit={handleSubmit}>
        <div className="grid md:grid-cols-2 gap-3">
          <div className="space-y-2">
            <label className="block text-sm font-medium">Provider</label>
            <select
              value={form.provider}
              onChange={handleChange('provider')}
              className="w-full border rounded px-3 py-2"
            >
              {providerOptions.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-medium">External ID</label>
            <input
              type="text"
              value={form.external_id}
              onChange={handleChange('external_id')}
              className="w-full border rounded px-3 py-2"
              placeholder="Calendar identifier"
            />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={handleChange('is_active')}
          />
          Active
        </label>
        <div className="space-y-2">
          <label className="block text-sm font-medium">Sync config (JSON)</label>
          <textarea
            value={form.sync_config}
            onChange={handleChange('sync_config')}
            className="w-full border rounded px-3 py-2 font-mono text-sm"
            rows={4}
          />
        </div>
        {error && <div className="text-sm text-red-600">{error}</div>}
        {message && <div className="text-sm text-green-600">{message}</div>}
        <button
          type="submit"
          className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-70"
          disabled={createMutation.isLoading}
        >
          {createMutation.isLoading ? 'Adding…' : 'Add integration'}
        </button>
      </form>
      <div className="space-y-4">
        <h4 className="text-lg font-semibold">Linked calendars</h4>
        {isLoading && <p>Loading…</p>}
        {!isLoading && (!integrations || integrations.length === 0) && (
          <p className="text-sm text-gray-600">No integrations yet.</p>
        )}
        <div className="space-y-4">
          {integrations?.map(integration => (
            <IntegrationRow
              key={integration.id}
              integration={integration}
              onUpdate={async (id, payload) => handleUpdate(id, payload)}
              onDelete={async id => handleDelete(id)}
            />
          ))}
        </div>
      </div>
    </section>
  )
}
