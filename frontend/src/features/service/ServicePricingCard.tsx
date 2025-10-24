import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { ServiceMembership } from '../profile/api'
import {
  createPricingModel,
  deletePricingModel,
  listPricingModels,
  PricingModel,
  PricingModelPayload,
  PricingTier,
  updatePricingModel
} from './api'

type Props = {
  membership: ServiceMembership
}

type ModalState =
  | { mode: 'create' }
  | { mode: 'edit'; model: PricingModel }

type FlashMessage = {
  message: string
  tone: 'success' | 'error'
}

type TierForm = {
  id?: number
  minGuests: number
  maxGuests: string
  pricePerGuest: string
}

type FormValues = {
  name: string
  description: string
  defaultLocation: string
  currency: string
  depositRequired: boolean
  depositPercent: string
  tiers: TierForm[]
}

export default function ServicePricingCard({ membership }: Props){
  const queryClient = useQueryClient()
  const [flash, setFlash] = useState<FlashMessage | null>(null)
  const [modalState, setModalState] = useState<ModalState | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)

  const queryKey = useMemo(
    () => ['pricing-models', membership.guide_service],
    [membership.guide_service]
  )

  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: () => listPricingModels(membership.guide_service)
  })

  const createMutation = useMutation({
    mutationFn: createPricingModel,
    onMutate: () => {
      setServerError(null)
    },
    onSuccess: () => {
      setFlash({ message: 'Pricing model created.', tone: 'success' })
      setModalState(null)
      queryClient.invalidateQueries({ queryKey })
    },
    onError: (err: unknown) => {
      setServerError(extractErrorMessage(err))
    }
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: PricingModelPayload }) =>
      updatePricingModel(id, payload),
    onMutate: () => {
      setServerError(null)
    },
    onSuccess: () => {
      setFlash({ message: 'Pricing model updated.', tone: 'success' })
      setModalState(null)
      queryClient.invalidateQueries({ queryKey })
    },
    onError: (err: unknown) => {
      setServerError(extractErrorMessage(err))
    }
  })

  const deleteMutation = useMutation({
    mutationFn: deletePricingModel,
    onSuccess: () => {
      setFlash({ message: 'Pricing model deleted.', tone: 'success' })
      queryClient.invalidateQueries({ queryKey })
    },
    onError: (err: unknown) => {
      setFlash({ message: extractErrorMessage(err), tone: 'error' })
    }
  })

  const pricingModels = data ?? []
  const isSaving = createMutation.isPending || updateMutation.isPending

  const handleDelete = async (model: PricingModel) => {
    if (!window.confirm(`Remove pricing model "${model.name}"?`)){
      return
    }
    setFlash(null)
    await deleteMutation.mutateAsync(model.id)
  }

  return (
    <section className="space-y-4 rounded-lg border bg-white p-5 shadow">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Pricing models</h3>
          <p className="text-xs text-gray-500">
            Define reusable pricing tiers and deposits to keep trip creation fast and consistent.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setFlash(null)
            setServerError(null)
            setModalState({ mode: 'create' })
          }}
          className="rounded bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-60"
        >
          Add pricing model
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

      {isLoading && <p className="text-sm text-gray-600">Loading pricing models…</p>}
      {error && (
        <p className="text-sm text-red-600">
          Unable to load pricing models. Please try again.
        </p>
      )}

      {!isLoading && !error && pricingModels.length === 0 && (
        <p className="text-sm text-gray-600">
          No pricing models defined yet. Create one to standardise pricing across trips.
        </p>
      )}

      <ul className="space-y-4">
        {pricingModels.map((model) => (
          <li key={model.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <h4 className="text-base font-semibold text-slate-900">{model.name}</h4>
                {model.description && (
                  <p className="text-sm text-slate-600">{model.description}</p>
                )}
                <p className="text-xs text-slate-500">
                  Currency: {model.currency?.toUpperCase() || '—'}
                  {model.default_location ? ` • Default location: ${model.default_location}` : ''}
                </p>
                <DepositSummary model={model} />
              </div>
              <div className="flex items-center gap-3 text-sm">
                <button
                  type="button"
                  className="text-blue-600 underline"
                  onClick={() => {
                    setFlash(null)
                    setServerError(null)
                    setModalState({ mode: 'edit', model })
                  }}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="text-red-600 underline disabled:opacity-60"
                  onClick={() => handleDelete(model)}
                  disabled={deleteMutation.isPending}
                >
                  Delete
                </button>
              </div>
            </div>
            <TierSummary tiers={model.tiers} currency={model.currency} />
          </li>
        ))}
      </ul>

      {modalState && (
        <PricingModelModal
          key={modalState.mode === 'edit' ? modalState.model.id : 'create'}
          mode={modalState.mode}
          model={modalState.mode === 'edit' ? modalState.model : undefined}
          serviceId={membership.guide_service}
          isSaving={isSaving}
          error={serverError}
          onClose={() => {
            if (!isSaving){
              setModalState(null)
              setServerError(null)
            }
          }}
          onSubmit={async (payload) => {
            setFlash(null)
            if (modalState.mode === 'create'){
              await createMutation.mutateAsync(payload)
            } else {
              await updateMutation.mutateAsync({ id: modalState.model.id, payload })
            }
          }}
        />
      )}
    </section>
  )
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

function DepositSummary({ model }: { model: PricingModel }){
  if (!model.is_deposit_required){
    return <p className="text-xs text-slate-500">Deposit not required.</p>
  }
  const percent = Number(model.deposit_percent)
  const formatted = Number.isFinite(percent)
    ? percent.toFixed(2).replace(/\.00$/, '')
    : String(model.deposit_percent)
  return (
    <p className="text-xs text-slate-500">Deposit required: {formatted}% per booking.</p>
  )
}

function TierSummary({ tiers, currency }: { tiers: PricingTier[]; currency: string }){
  if (!tiers.length){
    return null
  }
  const sorted = [...tiers].sort((a, b) => a.min_guests - b.min_guests)
  return (
    <dl className="mt-4 space-y-2 text-sm text-slate-700">
      {sorted.map((tier) => (
        <div
          key={tier.id ?? `${tier.min_guests}-${tier.max_guests ?? 'open'}`}
          className="flex flex-col gap-2 rounded border border-slate-200 bg-white px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
        >
          <dt>
            {tier.max_guests === null
              ? `${tier.min_guests}+ guests`
              : `${tier.min_guests} – ${tier.max_guests} guests`}
          </dt>
          <dd className="font-medium">
            {formatPrice(tier.price_per_guest, currency)} per guest
          </dd>
        </div>
      ))}
    </dl>
  )
}

type PricingModelModalProps = {
  serviceId: number
  mode: 'create' | 'edit'
  model?: PricingModel
  isSaving: boolean
  error: string | null
  onClose: () => void
  onSubmit: (payload: PricingModelPayload) => Promise<void>
}

function PricingModelModal({
  serviceId,
  mode,
  model,
  isSaving,
  error,
  onClose,
  onSubmit
}: PricingModelModalProps){
  const [form, setForm] = useState<FormValues>(() => toFormValues(model))
  const [formError, setFormError] = useState<string | null>(null)

  // Keep tiers contiguous by adjusting minimum guest counts any time maximums shift.
  const regenerateMinimums = (tiers: TierForm[]): TierForm[] => {
    let nextMin = 1
    return tiers.map((tier) => {
      const updated: TierForm = {
        ...tier,
        minGuests: nextMin
      }
      const maxValue = parsePositiveInt(updated.maxGuests)
      if (maxValue !== null){
        nextMin = maxValue + 1
      }
      return updated
    })
  }

  const handleTierChange = (index: number, field: keyof TierForm, value: string) => {
    setForm((prev) => {
      const tiers = prev.tiers.map((tier, i) =>
        i === index ? { ...tier, [field]: value } : tier
      )
      return { ...prev, tiers: regenerateMinimums(tiers) }
    })
  }

  const handleRemoveTier = (index: number) => {
    setForm((prev) => {
      if (prev.tiers.length === 1){
        return prev
      }
      const tiers = prev.tiers.filter((_, i) => i !== index)
      return { ...prev, tiers: regenerateMinimums(tiers) }
    })
  }

  const handleAddTier = () => {
    setFormError(null)
    setForm((prev) => {
      if (!prev.tiers.length){
        return prev
      }
      const last = prev.tiers[prev.tiers.length - 1]
      const lastMax = parsePositiveInt(last.maxGuests)
      if (lastMax === null){
        setFormError('Set a maximum guests value before adding another tier.')
        return prev
      }
      const tiers = [
        ...prev.tiers,
        {
          minGuests: lastMax + 1,
          maxGuests: '',
          pricePerGuest: ''
        }
      ]
      return { ...prev, tiers }
    })
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFormError(null)

    const validation = validateForm(form)
    if (validation){
      setFormError(validation)
      return
    }

    const payload = toPayload(form, serviceId)

    try {
      await onSubmit(payload)
    } catch (err) {
      setFormError(extractErrorMessage(err))
    }
  }

  const title = mode === 'create' ? 'Add pricing model' : `Edit ${model?.name ?? 'pricing model'}`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl">
        <header className="mb-4">
          <h3 className="text-lg font-semibold">{title}</h3>
          <p className="text-sm text-slate-600">
            Configure per-guest pricing tiers. Leave the final “to guests” field blank to cover open-ended groups.
          </p>
        </header>

        {(formError || error) && (
          <div className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {formError || error}
          </div>
        )}

        <form className="space-y-5" onSubmit={handleSubmit}>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">
              Name
              <input
                required
                type="text"
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Currency
              <input
                type="text"
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm uppercase focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                value={form.currency}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, currency: event.target.value.toLowerCase() }))
                }
              />
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">
              Default location (optional)
              <input
                type="text"
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                value={form.defaultLocation}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, defaultLocation: event.target.value }))
                }
              />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Deposit required?
              <div className="mt-2 flex items-center gap-2">
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
                <span className="text-sm text-slate-600">Require deposit during booking</span>
              </div>
            </label>
          </div>

          {form.depositRequired && (
            <label className="text-sm font-medium text-slate-700">
              Deposit percent
              <input
                type="number"
                min={0}
                max={100}
                step={0.1}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100 md:max-w-xs"
                value={form.depositPercent}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, depositPercent: event.target.value }))
                }
              />
            </label>
          )}

          <label className="block text-sm font-medium text-slate-700">
            Description (optional)
            <textarea
              rows={3}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
              value={form.description}
              onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
            />
          </label>

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
                    key={tier.id ?? index}
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
                        className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                        value={tier.maxGuests}
                        onChange={(event) =>
                          handleTierChange(index, 'maxGuests', event.target.value)
                        }
                        placeholder={isLast ? 'Leave blank for open-ended' : ''}
                        disabled={isSaving}
                      />
                    </label>

                <label className="text-sm font-medium text-slate-700">
                      Price per guest
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                        value={tier.pricePerGuest}
                        onChange={(event) =>
                          handleTierChange(index, 'pricePerGuest', event.target.value)
                        }
                        required
                        disabled={isSaving}
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
              {isSaving ? 'Saving…' : 'Save pricing model'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function toFormValues(model?: PricingModel): FormValues {
  if (!model){
    return {
      name: '',
      description: '',
      defaultLocation: '',
      currency: 'usd',
      depositRequired: false,
      depositPercent: '0',
      tiers: [
        {
          minGuests: 1,
          maxGuests: '',
          pricePerGuest: ''
        }
      ]
    }
  }
  const sortedTiers = [...model.tiers].sort((a, b) => a.min_guests - b.min_guests)
  return {
    name: model.name,
    description: model.description ?? '',
    defaultLocation: model.default_location ?? '',
    currency: model.currency ?? 'usd',
    depositRequired: model.is_deposit_required,
    depositPercent: String(model.deposit_percent ?? '0'),
    tiers: sortedTiers.map((tier) => ({
      id: tier.id,
      minGuests: tier.min_guests,
      maxGuests: tier.max_guests === null ? '' : String(tier.max_guests),
      pricePerGuest: String(tier.price_per_guest)
    }))
  }
}

function validateForm(form: FormValues): string | null {
  if (!form.name.trim()){
    return 'Name is required.'
  }
  if (!form.currency.trim()){
    return 'Currency is required.'
  }
  if (!form.tiers.length){
    return 'Add at least one pricing tier.'
  }

  for (let index = 0; index < form.tiers.length; index += 1){
    const tier = form.tiers[index]
    const priceNumber = Number(tier.pricePerGuest)
    if (!tier.pricePerGuest || !Number.isFinite(priceNumber) || priceNumber <= 0){
      return `Tier ${index + 1}: price per guest must be greater than zero.`
    }
    const maxValue = parsePositiveInt(tier.maxGuests)
    if (index < form.tiers.length - 1){
      if (maxValue === null){
        return `Tier ${index + 1}: specify a maximum guests value before adding more tiers.`
      }
      if (maxValue < tier.minGuests){
        return `Tier ${index + 1}: max guests must be at least ${tier.minGuests}.`
      }
    } else if (maxValue !== null){
      return 'Final tier must leave the “to guests” field blank to cover open-ended groups.'
    }
  }

  if (form.depositRequired){
    const deposit = Number(form.depositPercent)
    if (!Number.isFinite(deposit) || deposit <= 0 || deposit > 100){
      return 'Deposit percent must be between 0 and 100.'
    }
  }

  return null
}

function toPayload(form: FormValues, serviceId: number): PricingModelPayload {
  return {
    service: serviceId,
    name: form.name.trim(),
    description: form.description.trim(),
    default_location: form.defaultLocation.trim(),
    currency: form.currency.trim().toLowerCase(),
    is_deposit_required: form.depositRequired,
    deposit_percent: formatDecimal(form.depositRequired ? form.depositPercent : '0'),
    tiers: form.tiers.map((tier) => ({
      ...(tier.id ? { id: tier.id } : {}),
      min_guests: tier.minGuests,
      max_guests: parsePositiveInt(tier.maxGuests),
      price_per_guest: formatDecimal(tier.pricePerGuest)
    }))
  }
}

function formatPrice(value: string, currency: string): string {
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

function formatDecimal(value: string): string {
  const numberValue = Number(value)
  if (!Number.isFinite(numberValue)){
    return value
  }
  return numberValue.toFixed(2)
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
