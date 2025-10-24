import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { ServiceMembership } from '../profile/api'
import {
  createTripTemplate,
  deleteTripTemplate,
  listPricingModels,
  listTripTemplates,
  PricingModel,
  TripTemplate,
  TripTemplatePayload,
  updateTripTemplate
} from './api'

type Props = {
  membership: ServiceMembership
}

type ModalState =
  | { mode: 'create' }
  | { mode: 'edit'; template: TripTemplate }

type FlashMessage = {
  message: string
  tone: 'success' | 'error'
}

type TemplateForm = {
  title: string
  durationHours: string
  location: string
  pricingModel: string
  targetClients: string
  targetGuides: string
  notes: string
  isActive: boolean
}

export default function ServiceTemplatesCard({ membership }: Props){
  const queryClient = useQueryClient()
  const [modalState, setModalState] = useState<ModalState | null>(null)
  const [flash, setFlash] = useState<FlashMessage | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  const templateQueryKey = useMemo(
    () => ['trip-templates', membership.guide_service],
    [membership.guide_service]
  )
  const pricingQueryKey = useMemo(
    () => ['pricing-models', membership.guide_service],
    [membership.guide_service]
  )

  const templatesQuery = useQuery({
    queryKey: templateQueryKey,
    queryFn: () => listTripTemplates(membership.guide_service)
  })

  const pricingModelsQuery = useQuery({
    queryKey: pricingQueryKey,
    queryFn: () => listPricingModels(membership.guide_service)
  })

  const createMutation = useMutation({
    mutationFn: createTripTemplate,
    onMutate: () => setFormError(null),
    onSuccess: () => {
      setFlash({ message: 'Template created.', tone: 'success' })
      setModalState(null)
      queryClient.invalidateQueries({ queryKey: templateQueryKey })
    },
    onError: (err: unknown) => setFormError(extractErrorMessage(err))
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: TripTemplatePayload }) =>
      updateTripTemplate(id, payload),
    onMutate: () => setFormError(null),
    onSuccess: () => {
      setFlash({ message: 'Template updated.', tone: 'success' })
      setModalState(null)
      queryClient.invalidateQueries({ queryKey: templateQueryKey })
    },
    onError: (err: unknown) => setFormError(extractErrorMessage(err))
  })

  const deleteMutation = useMutation({
    mutationFn: deleteTripTemplate,
    onSuccess: () => {
      setFlash({ message: 'Template deleted.', tone: 'success' })
      queryClient.invalidateQueries({ queryKey: templateQueryKey })
    },
    onError: (err: unknown) => {
      setFlash({ message: extractErrorMessage(err), tone: 'error' })
    }
  })

  const templates = templatesQuery.data ?? []
  const pricingModels = pricingModelsQuery.data ?? []
  const isSaving = createMutation.isPending || updateMutation.isPending

  const handleDelete = async (template: TripTemplate) => {
    if (!window.confirm(`Remove template "${template.title}"?`)){
      return
    }
    setFlash(null)
    await deleteMutation.mutateAsync(template.id)
  }

  return (
    <section className="space-y-4 rounded-lg border bg-white p-5 shadow">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Trip templates</h3>
          <p className="text-xs text-gray-500">
            Reuse structured trip details and pricing models to speed up staff scheduling.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setFlash(null)
            setFormError(null)
            setModalState({ mode: 'create' })
          }}
          className="rounded bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500"
        >
          New template
        </button>
      </header>

      {flash && (
        <div
          className={`rounded border px-3 py-2 text-xs ${
            flash.tone === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {flash.message}
        </div>
      )}

      {templatesQuery.isLoading && <p className="text-sm text-gray-600">Loading templates…</p>}
      {templatesQuery.error && (
        <p className="text-sm text-red-600">Unable to load templates. Please try again.</p>
      )}

      {!templatesQuery.isLoading && !templatesQuery.error && templates.length === 0 && (
        <p className="text-sm text-gray-600">
          No trip templates yet. Create one to pre-fill trip details and pricing.
        </p>
      )}

      <ul className="space-y-4">
        {templates.map((template) => (
          <li key={template.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <h4 className="text-base font-semibold text-slate-900">
                  {template.title}
                  {!template.is_active && (
                    <span className="ml-2 inline-flex items-center rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700">
                      Inactive
                    </span>
                  )}
                </h4>
                <p className="text-xs text-slate-500">
                  Location: {template.location} · Duration: {template.duration_hours}h · Ratio:{' '}
                  {template.target_client_count}:{template.target_guide_count}
                </p>
                <p className="text-xs text-slate-500">Pricing model: {template.pricing_model_name}</p>
                {template.notes && (
                  <p className="text-sm text-slate-600 whitespace-pre-line">{template.notes}</p>
                )}
              </div>
              <div className="flex items-center gap-3 text-sm">
                <button
                  type="button"
                  className="text-blue-600 underline"
                  onClick={() => {
                    setFlash(null)
                    setFormError(null)
                    setModalState({ mode: 'edit', template })
                  }}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="text-red-600 underline disabled:opacity-60"
                  onClick={() => handleDelete(template)}
                  disabled={deleteMutation.isPending}
                >
                  Delete
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {modalState && (
        <TemplateModal
          mode={modalState.mode}
          template={modalState.mode === 'edit' ? modalState.template : undefined}
          pricingModels={pricingModels}
          isSaving={isSaving}
          error={formError}
          onClose={() => {
            if (!isSaving){
              setModalState(null)
              setFormError(null)
            }
          }}
          onSubmit={async (payload) => {
            setFlash(null)
            if (modalState.mode === 'create'){
              await createMutation.mutateAsync(payload)
            } else {
              await updateMutation.mutateAsync({ id: modalState.template.id, payload })
            }
          }}
          serviceId={membership.guide_service}
        />
      )}
    </section>
  )
}

type TemplateModalProps = {
  mode: 'create' | 'edit'
  template?: TripTemplate
  pricingModels: PricingModel[]
  isSaving: boolean
  error: string | null
  onClose: () => void
  onSubmit: (payload: TripTemplatePayload) => Promise<void>
  serviceId: number
}

function TemplateModal({
  mode,
  template,
  pricingModels,
  isSaving,
  error,
  onClose,
  onSubmit,
  serviceId
}: TemplateModalProps){
  const [form, setForm] = useState<TemplateForm>(() => toForm(template, pricingModels))
  const [localError, setLocalError] = useState<string | null>(null)

  const handleChange = <K extends keyof TemplateForm>(key: K, value: TemplateForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const validation = validateForm(form)
    if (validation){
      setLocalError(validation)
      return
    }
    setLocalError(null)
    const payload = toPayload(form, serviceId)
    try {
      await onSubmit(payload)
    } catch (err){
      setLocalError(extractErrorMessage(err))
    }
  }

  const title = mode === 'create' ? 'New template' : `Edit ${template?.title ?? 'template'}`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl">
        <header className="mb-4">
          <h3 className="text-lg font-semibold">{title}</h3>
          <p className="text-sm text-slate-600">
            Templates capture default trip details, ratios, and pricing model.
          </p>
        </header>

        {(localError || error) && (
          <div className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {localError || error}
          </div>
        )}

        <form className="space-y-5" onSubmit={handleSubmit}>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">
              Title
              <input
                required
                type="text"
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                value={form.title}
                onChange={(event) => handleChange('title', event.target.value)}
                disabled={isSaving}
              />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Location
              <input
                required
                type="text"
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                value={form.location}
                onChange={(event) => handleChange('location', event.target.value)}
                disabled={isSaving}
              />
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <label className="text-sm font-medium text-slate-700">
              Duration (hours)
              <input
                required
                type="number"
                min={1}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                value={form.durationHours}
                onChange={(event) => handleChange('durationHours', event.target.value)}
                disabled={isSaving}
              />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Clients per trip
              <input
                required
                type="number"
                min={1}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                value={form.targetClients}
                onChange={(event) => handleChange('targetClients', event.target.value)}
                disabled={isSaving}
              />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Guides per trip
              <input
                required
                type="number"
                min={1}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                value={form.targetGuides}
                onChange={(event) => handleChange('targetGuides', event.target.value)}
                disabled={isSaving}
              />
            </label>
          </div>

          <label className="text-sm font-medium text-slate-700">
            Pricing model
            <select
              required
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
              value={form.pricingModel}
              onChange={(event) => handleChange('pricingModel', event.target.value)}
              disabled={isSaving || pricingModels.length === 0}
            >
              <option value="">Select model…</option>
              {pricingModels.map((model) => (
                <option key={model.id} value={String(model.id)}>
                  {model.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm font-medium text-slate-700">
            Notes (optional)
            <textarea
              rows={4}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
              value={form.notes}
              onChange={(event) => handleChange('notes', event.target.value)}
              disabled={isSaving}
            />
          </label>

          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={form.isActive}
              onChange={(event) => handleChange('isActive', event.target.checked)}
              disabled={isSaving}
            />
            Active template
          </label>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              className="text-sm text-slate-600 underline disabled:opacity-50"
              onClick={onClose}
              disabled={isSaving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-60"
              disabled={isSaving || pricingModels.length === 0}
            >
              {isSaving ? 'Saving…' : 'Save template'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function toForm(template: TripTemplate | undefined, pricingModels: PricingModel[]): TemplateForm {
  if (!template){
    const defaultPricing = pricingModels[0]
    return {
      title: '',
      durationHours: '8',
      location: '',
      pricingModel: defaultPricing ? String(defaultPricing.id) : '',
      targetClients: '4',
      targetGuides: '1',
      notes: '',
      isActive: true
    }
  }
  return {
    title: template.title,
    durationHours: String(template.duration_hours || ''),
    location: template.location,
    pricingModel: String(template.pricing_model),
    targetClients: String(template.target_client_count),
    targetGuides: String(template.target_guide_count),
    notes: template.notes || '',
    isActive: template.is_active
  }
}

function validateForm(form: TemplateForm): string | null {
  if (!form.title.trim()){
    return 'Title is required.'
  }
  if (!form.location.trim()){
    return 'Location is required.'
  }
  if (!form.durationHours.trim() || Number(form.durationHours) < 1){
    return 'Duration must be at least 1 hour.'
  }
  if (!form.targetClients.trim() || Number(form.targetClients) < 1){
    return 'Client count must be at least 1.'
  }
  if (!form.targetGuides.trim() || Number(form.targetGuides) < 1){
    return 'Guide count must be at least 1.'
  }
  if (!form.pricingModel){
    return 'Select a pricing model.'
  }
  return null
}

function toPayload(form: TemplateForm, serviceId: number): TripTemplatePayload {
  return {
    service: serviceId,
    title: form.title.trim(),
    duration_hours: Number(form.durationHours),
    location: form.location.trim(),
    pricing_model: Number(form.pricingModel),
    target_client_count: Number(form.targetClients),
    target_guide_count: Number(form.targetGuides),
    notes: form.notes.trim(),
    is_active: form.isActive
  }
}

function extractErrorMessage(err: unknown): string {
  const response = (err as any)?.response?.data
  if (!response){
    return (err as any)?.message || 'Unexpected error.'
  }
  if (typeof response === 'string'){
    return response
  }
  if (Array.isArray(response)){
    return response.join(' ')
  }
  const parts: string[] = []
  Object.entries(response).forEach(([key, value]) => {
    if (Array.isArray(value)){
      parts.push(`${key}: ${value.join(' ')}`)
    } else if (typeof value === 'string'){
      parts.push(`${key}: ${value}`)
    }
  })
  if (parts.length){
    return parts.join(' ')
  }
  return (err as any)?.message || 'Unexpected error.'
}
