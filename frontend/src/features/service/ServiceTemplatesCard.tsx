import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { ServiceMembership } from '../profile/api'
import {
  createTripTemplate,
  deleteTripTemplate,
  duplicateTripTemplate,
  listTripTemplates,
  TripTemplate,
  TripTemplatePayload,
  updateTripTemplate
} from './api'

const DEFAULT_CURRENCY = 'usd'

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

type TierForm = {
  minGuests: number
  maxGuests: string
  pricePerGuest: string
}

type TemplateForm = {
  title: string
  durationHours: string
  location: string
  currency: string
  depositRequired: boolean
  depositPercent: string
  tiers: TierForm[]
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

  const templatesQuery = useQuery({
    queryKey: templateQueryKey,
    queryFn: () => listTripTemplates(membership.guide_service)
  })

  const createMutation = useMutation({
    mutationFn: (payload: TripTemplatePayload) => createTripTemplate(payload),
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

  const duplicateMutation = useMutation({
    mutationFn: duplicateTripTemplate,
    onMutate: () => setFlash(null),
    onSuccess: (template) => {
      setFlash({ message: 'Template duplicated.', tone: 'success' })
      queryClient.invalidateQueries({ queryKey: templateQueryKey })
      setModalState({ mode: 'edit', template })
    },
    onError: (err: unknown) => setFlash({ message: extractErrorMessage(err), tone: 'error' })
  })

  const templates = templatesQuery.data ?? []
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
            Reuse structured trip details and pricing to speed up staff scheduling.
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
                <p className="text-xs text-slate-500">
                  First tier: {template.pricing_tiers.length ? formatCurrency(template.pricing_tiers[0].price_per_guest, template.pricing_currency) : '—'}
                </p>
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
                  className="text-blue-600 underline"
                  onClick={() => duplicateMutation.mutate(template.id)}
                >
                  Duplicate
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
            {template.pricing_tiers.length > 0 && (
              <dl className="mt-3 space-y-1 text-xs text-slate-600">
                {template.pricing_tiers.map((tier, index) => (
                  <div key={`${template.id}-tier-${index}`} className="flex items-center gap-2">
                    <dt>
                      {tier.max_guests === null
                        ? `${tier.min_guests}+ guests`
                        : `${tier.min_guests} – ${tier.max_guests} guests`}
                    </dt>
                    <dd>{formatCurrency(tier.price_per_guest, template.pricing_currency)} per guest</dd>
                  </div>
                ))}
              </dl>
            )}
          </li>
        ))}
      </ul>

      {modalState && (
        <TemplateModal
          key={modalState.mode === 'edit' ? modalState.template.id : 'create'}
          mode={modalState.mode}
          template={modalState.mode === 'edit' ? modalState.template : undefined}
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
              await createMutation.mutateAsync({ service: membership.guide_service, ...payload })
            } else {
              await updateMutation.mutateAsync({ id: modalState.template.id, payload: { service: membership.guide_service, ...payload } })
            }
          }}
        />
      )}
    </section>
  )
}

type TemplateModalProps = {
  mode: 'create' | 'edit'
  template?: TripTemplate
  isSaving: boolean
  error: string | null
  onClose: () => void
  onSubmit: (payload: Omit<TripTemplatePayload, 'service'>) => Promise<void>
}

function TemplateModal({ mode, template, isSaving, error, onClose, onSubmit }: TemplateModalProps){
  const [form, setForm] = useState<TemplateForm>(() => toForm(template))
  const [localError, setLocalError] = useState<string | null>(null)

  const regenerateMinimums = (tiers: TierForm[]): TierForm[] => {
    let nextMin = 1
    return tiers.map((tier) => {
      const maxValue = parsePositiveInt(tier.maxGuests)
      const updated: TierForm = {
        ...tier,
        minGuests: nextMin
      }
      if (maxValue !== null){
        nextMin = maxValue + 1
      }
      return updated
    })
  }

  const handleTierChange = (index: number, key: keyof TierForm, value: string) => {
    setForm((prev) => {
      const tiers = prev.tiers.map((tier, i) => (i === index ? { ...tier, [key]: value } : tier))
      return { ...prev, tiers: regenerateMinimums(tiers) }
    })
  }

  const handleRemoveTier = (index: number) => {
    setForm((prev) => {
      if (prev.tiers.length === 1) return prev
      const tiers = prev.tiers.filter((_, i) => i !== index)
      return { ...prev, tiers: regenerateMinimums(tiers) }
    })
  }

  const handleAddTier = () => {
    setLocalError(null)
    setForm((prev) => {
      const last = prev.tiers[prev.tiers.length - 1]
      const lastMax = parsePositiveInt(last.maxGuests)
      if (lastMax === null){
        setLocalError('Set a maximum guests value before adding another tier.')
        return prev
      }
      return {
        ...prev,
        tiers: [...prev.tiers, { minGuests: lastMax + 1, maxGuests: '', pricePerGuest: '' }]
      }
    })
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setLocalError(null)
    const validation = validateForm(form)
    if (validation){
      setLocalError(validation)
      return
    }
    const payload = toPayload(form)
    await onSubmit(payload)
  }

  const title = mode === 'create' ? 'New template' : `Edit ${template?.title ?? 'template'}`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4">
      <div className="flex w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl max-h-[90vh]">
        <div className="flex-1 overflow-y-auto p-6">
          <header className="mb-4">
            <h3 className="text-lg font-semibold">{title}</h3>
            <p className="text-sm text-slate-600">
              Configure trip defaults, pricing tiers, and staffing ratios. The final tier should cover open-ended guest counts.
            </p>
          </header>

          {(localError || error) && (
            <div className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {localError || error}
            </div>
          )}

          <form className="space-y-5 pb-2" onSubmit={handleSubmit}>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">
              Title
              <input
                required
                type="text"
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                value={form.title}
                onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
              />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Location
              <input
                required
                type="text"
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                value={form.location}
                onChange={(event) => setForm((prev) => ({ ...prev, location: event.target.value }))}
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
                onChange={(event) => setForm((prev) => ({ ...prev, durationHours: event.target.value }))}
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
                onChange={(event) => setForm((prev) => ({ ...prev, targetClients: event.target.value }))}
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
                onChange={(event) => setForm((prev) => ({ ...prev, targetGuides: event.target.value }))}
              />
            </label>
          </div>

          <label className="text-sm font-medium text-slate-700">
            Currency
            <input
              type="text"
              value={form.currency}
              onChange={(event) => setForm((prev) => ({ ...prev, currency: event.target.value.toLowerCase() }))}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm uppercase focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
            />
          </label>

          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={form.depositRequired}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  depositRequired: event.target.checked,
                  depositPercent: event.target.checked ? prev.depositPercent || '10' : '0'
                }))
              }
            />
            Require deposit during booking
          </label>

          {form.depositRequired && (
            <label className="text-sm font-medium text-slate-700">
              Deposit percent
              <input
                type="number"
                min={0}
                max={100}
                step={0.1}
                value={form.depositPercent}
                onChange={(event) => setForm((prev) => ({ ...prev, depositPercent: event.target.value }))}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100 md:max-w-xs"
              />
            </label>
          )}

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-700">Pricing tiers</p>
              <button
                type="button"
                onClick={handleAddTier}
                className="text-sm text-emerald-600 underline disabled:opacity-50"
                disabled={isSaving}
              >
                Add tier
              </button>
            </div>

            <div className="space-y-3">
              {form.tiers.map((tier, index) => {
                const isLast = index === form.tiers.length - 1
                return (
                  <div
                    key={index}
                    className="grid gap-3 rounded border border-slate-200 bg-white p-3 md:grid-cols-4 md:items-end"
                  >
                    <div>
                      <p className="text-xs font-semibold uppercase text-slate-500">From guests</p>
                      <p className="mt-1 text-sm font-medium text-slate-700">{tier.minGuests}</p>
                    </div>

                    <label className="text-sm font-medium text-slate-700">
                      To guests
                      <input
                        type="number"
                        min={tier.minGuests}
                        value={tier.maxGuests}
                        onChange={(event) => handleTierChange(index, 'maxGuests', event.target.value)}
                        placeholder={isLast ? 'Leave blank for open-ended' : ''}
                        disabled={isSaving}
                        className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                      />
                    </label>

                    <label className="text-sm font-medium text-slate-700">
                      Price per guest
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={tier.pricePerGuest}
                        onChange={(event) => handleTierChange(index, 'pricePerGuest', event.target.value)}
                        required
                        disabled={isSaving}
                        className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                      />
                    </label>

                    <div className="flex h-full items-center justify-end">
                      <button
                        type="button"
                        className="text-sm text-red-600 underline disabled:opacity-50"
                        onClick={() => handleRemoveTier(index)}
                        disabled={isSaving || form.tiers.length === 1}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <label className="block text-sm font-medium text-slate-700">
            Notes (optional)
            <textarea
              rows={3}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
              value={form.notes}
              onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
            />
          </label>

          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={form.isActive}
              onChange={(event) => setForm((prev) => ({ ...prev, isActive: event.target.checked }))}
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
              disabled={isSaving}
            >
              {isSaving ? 'Saving…' : 'Save template'}
            </button>
          </div>
        </form>
        </div>
      </div>
    </div>
  )
}

function toForm(template?: TripTemplate): TemplateForm {
  if (!template){
    return {
      title: '',
      durationHours: '',
      location: '',
      currency: DEFAULT_CURRENCY,
      depositRequired: false,
      depositPercent: '0',
      tiers: [
        { minGuests: 1, maxGuests: '', pricePerGuest: '' }
      ],
      targetClients: '',
      targetGuides: '',
      notes: '',
      isActive: true
    }
  }

  const tiers = template.pricing_tiers.length
    ? template.pricing_tiers.map((tier, index) => ({
        minGuests: tier.min_guests || index + 1,
        maxGuests: tier.max_guests === null || tier.max_guests === undefined ? '' : String(tier.max_guests),
        pricePerGuest: String(tier.price_per_guest)
      }))
    : [{ minGuests: 1, maxGuests: '', pricePerGuest: '' }]

  return {
    title: template.title,
    durationHours: template.duration_hours ? String(template.duration_hours) : '',
    location: template.location,
    currency: template.pricing_currency || DEFAULT_CURRENCY,
    depositRequired: template.is_deposit_required,
    depositPercent: String(template.deposit_percent ?? '0'),
    tiers,
    targetClients: template.target_client_count ? String(template.target_client_count) : '',
    targetGuides: template.target_guide_count ? String(template.target_guide_count) : '',
    notes: template.notes || '',
    isActive: template.is_active
  }
}

function validateForm(form: TemplateForm): string | null {
  if (!form.title.trim()) return 'Title is required.'
  if (!form.location.trim()) return 'Location is required.'
  if (!form.durationHours.trim() || Number(form.durationHours) < 1) return 'Duration must be at least 1 hour.'
  if (!form.targetClients.trim() || Number(form.targetClients) < 1) return 'Clients per trip must be at least 1.'
  if (!form.targetGuides.trim() || Number(form.targetGuides) < 1) return 'Guides per trip must be at least 1.'
  if (!form.tiers.length) return 'Add at least one pricing tier.'

  for (let i = 0; i < form.tiers.length; i += 1){
    const tier = form.tiers[i]
    const price = Number(tier.pricePerGuest)
    if (!tier.pricePerGuest || Number.isNaN(price) || price <= 0){
      return `Tier ${i + 1}: price per guest must be greater than zero.`
    }
    const maxValue = parsePositiveInt(tier.maxGuests)
    if (i < form.tiers.length - 1){
      if (maxValue === null){
        return `Tier ${i + 1}: specify a maximum guests value before adding more tiers.`
      }
      if (maxValue < tier.minGuests){
        return `Tier ${i + 1}: max guests must be at least ${tier.minGuests}.`
      }
    } else if (maxValue !== null){
      return 'Final tier must leave the “to guests” field blank to cover open-ended groups.'
    }
  }

  if (form.depositRequired){
    const deposit = Number(form.depositPercent)
    if (Number.isNaN(deposit) || deposit <= 0 || deposit > 100){
      return 'Deposit percent must be between 0 and 100.'
    }
  }

  return null
}

function toPayload(form: TemplateForm): Omit<TripTemplatePayload, 'service'> {
  return {
    title: form.title.trim(),
    duration_hours: Number(form.durationHours || '0'),
    location: form.location.trim(),
    pricing_currency: form.currency.trim() || DEFAULT_CURRENCY,
    is_deposit_required: form.depositRequired,
    deposit_percent: form.depositRequired ? form.depositPercent : '0',
    pricing_tiers: form.tiers.map((tier) => ({
      min_guests: tier.minGuests,
      max_guests: parsePositiveInt(tier.maxGuests),
      price_per_guest: String(tier.pricePerGuest)
    })),
    target_client_count: Number(form.targetClients || '0'),
    target_guide_count: Number(form.targetGuides || '0'),
    notes: form.notes.trim(),
    is_active: form.isActive
  }
}

function parsePositiveInt(value: string): number | null {
  if (!value){
    return null
  }
  const parsed = Number(value)
  if (!Number.isFinite(parsed)){
    return null
  }
  const rounded = Math.floor(parsed)
  if (rounded < 0){
    return null
  }
  return rounded
}

function formatCurrency(value: string, currency: string): string {
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
