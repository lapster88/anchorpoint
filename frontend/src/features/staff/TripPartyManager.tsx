import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { TripSummary } from './CreatePartyForm'
import CreatePartyForm from './CreatePartyForm'
import { listTripParties, TripPartySummary } from './api'
import {
  getTrip,
  TripAssignment,
  TripDetail,
  listServiceGuides,
  assignGuides,
  GuideOption,
} from '../trips/api'

type Props = {
  trip: TripSummary
  onClose: () => void
  canEditAssignments: boolean
  serviceId: number | null
  onTripUpdate?: (trip: TripDetail) => void
}

export default function TripPartyManager({ trip, onClose, canEditAssignments, serviceId, onTripUpdate }: Props){
  const queryClient = useQueryClient()
  const [showAdvancedForm, setShowAdvancedForm] = useState(false)
  const [guides, setGuides] = useState<GuideOption[]>([])
  const [selectedGuideIds, setSelectedGuideIds] = useState<number[]>([])
  const [showSaved, setShowSaved] = useState(false)

  const tripDetailQuery = useQuery({
    queryKey: ['trip-detail', trip.id],
    queryFn: () => getTrip(trip.id)
  })

  useEffect(() => {
    let active = true
    if (!canEditAssignments || !serviceId) {
      setGuides([])
      return () => {
        active = false
      }
    }
    listServiceGuides(serviceId)
      .then(data => {
        if (!active) return
        setGuides(data)
      })
      .catch(() => {
        if (!active) return
        setGuides([])
      })
    return () => {
      active = false
    }
  }, [canEditAssignments, serviceId])

  const { data, isLoading, error } = useQuery({
    queryKey: ['trip-parties', trip.id],
    queryFn: () => listTripParties(trip.id)
  })

  const parties = useMemo<TripPartySummary[]>(() => data ?? tripDetailQuery.data?.parties ?? [], [data, tripDetailQuery.data])
  const hasParties = parties.length > 0

  const assignments = useMemo<TripAssignment[]>(() => tripDetailQuery.data?.assignments ?? [], [tripDetailQuery.data])
  const requiresAssignment = tripDetailQuery.data?.requires_assignment ?? assignments.length === 0
  const tripMeta: TripDetail | null = tripDetailQuery.data ?? null
  const title = tripMeta?.title ?? trip.title
  const locationLabel = tripMeta?.location ?? trip.location
  const startDate = new Date(tripMeta?.start ?? trip.start)
  const priceCents = tripMeta?.price_cents ?? trip.price_cents
  const priceLabel = `$${(priceCents / 100).toFixed(2)} per guest`
  const formTrip = useMemo(() => ({
    id: trip.id,
    title,
    location: locationLabel,
    start: tripMeta?.start ?? trip.start,
    end: tripMeta?.end ?? trip.end,
    price_cents: priceCents,
  }), [trip.id, title, locationLabel, tripMeta?.start, tripMeta?.end, trip.start, trip.end, priceCents])
  useEffect(() => {
    setSelectedGuideIds(assignments.map((assignment) => assignment.guide_id))
  }, [assignments])

  const assignGuidesMutation = useMutation({
    mutationFn: (guideIds: number[]) => assignGuides(trip.id, guideIds),
    onMutate: () => {
      setShowSaved(false)
    },
    onSuccess: (updatedTrip) => {
      setShowSaved(true)
      queryClient.setQueryData(['trip-detail', trip.id], updatedTrip)
      if (Array.isArray(updatedTrip.parties)) {
        queryClient.setQueryData(['trip-parties', trip.id], updatedTrip.parties)
      }
      const existingTrips = queryClient.getQueryData(['trips'])
      if (existingTrips) {
        queryClient.setQueryData(['trips'], (existing: any) => {
          if (Array.isArray(existing)) {
            return existing.map((item) =>
              item.id === updatedTrip.id
                ? {
                    ...item,
                    assignments: updatedTrip.assignments,
                    requires_assignment: updatedTrip.requires_assignment,
                  }
                : item
            )
          }
          if (Array.isArray(existing?.results)) {
            return {
              ...existing,
              results: existing.results.map((item: any) =>
                item.id === updatedTrip.id
                  ? {
                      ...item,
                      assignments: updatedTrip.assignments,
                      requires_assignment: updatedTrip.requires_assignment,
                    }
                  : item
              ),
            }
          }
          return existing
        })
      }
      onTripUpdate?.(updatedTrip)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['trip-detail', trip.id] })
      queryClient.invalidateQueries({ queryKey: ['trip-parties', trip.id] })
      queryClient.invalidateQueries({ queryKey: ['trips'] })
    }
  })

  const handleCreated = () => {
    queryClient.invalidateQueries({ queryKey: ['trip-parties', trip.id] })
    queryClient.invalidateQueries({ queryKey: ['trip-detail', trip.id] })
    setShowAdvancedForm(false)
  }

  useEffect(() => {
    if (tripDetailQuery.data) {
      onTripUpdate?.(tripDetailQuery.data)
    }
  }, [tripDetailQuery.data, onTripUpdate])

  useEffect(() => {
    if (!showSaved) return
    const timeout = window.setTimeout(() => setShowSaved(false), 3000)
    return () => window.clearTimeout(timeout)
  }, [showSaved])

  return (
    <section className="border rounded-lg bg-white shadow-md p-6 space-y-6">
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Manage {title}</h2>
          <p className="text-sm text-gray-600">
            {locationLabel ? `${locationLabel} · ` : ''}{startDate.toLocaleDateString()} · {priceLabel}
          </p>
          {tripMeta?.guide_service_name && (
            <p className="text-xs text-gray-500">{tripMeta.guide_service_name}</p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-sm text-gray-600 underline self-start md:self-center"
        >
          Close
        </button>
      </header>

      <section className="bg-slate-100 border border-slate-200 rounded-md px-4 py-3 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-medium text-gray-700">Guide assignment</h3>
          {canEditAssignments && (
            assignGuidesMutation.isPending ? (
              <span className="text-xs text-gray-500">Saving…</span>
            ) : showSaved ? (
              <span className="text-xs text-green-600">Saved</span>
            ) : null
          )}
        </div>
        {assignGuidesMutation.isError && (
          <p className="text-sm text-red-600">Unable to update guide assignment. Please try again.</p>
        )}
        {canEditAssignments ? (
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wide text-gray-500">Assigned guides</p>
            {guides.length === 0 && (
              <p className="text-xs text-gray-500">No active guides available for this service.</p>
            )}
            <div className="flex flex-col gap-2">
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
                      onChange={async (event) => {
                        const next = event.target.checked
                          ? [...selectedGuideIds, guide.id]
                          : selectedGuideIds.filter((id) => id !== guide.id)
                        setSelectedGuideIds(next)
                        try {
                          await assignGuidesMutation.mutateAsync(next)
                        } catch {
                          setSelectedGuideIds(assignments.map((assignment) => assignment.guide_id))
                        }
                      }}
                      disabled={assignGuidesMutation.isPending}
                    />
                    <span>{name}</span>
                  </label>
                )
              })}
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="text-xs text-blue-600 underline disabled:opacity-50"
                onClick={async () => {
                  setSelectedGuideIds([])
                  try {
                    await assignGuidesMutation.mutateAsync([])
                  } catch {
                    setSelectedGuideIds(assignments.map((assignment) => assignment.guide_id))
                  }
                }}
                disabled={assignGuidesMutation.isPending || selectedGuideIds.length === 0}
              >
                Clear all
              </button>
            </div>
          </div>
        ) : requiresAssignment ? (
          <p className="text-sm text-amber-700">No guide assigned yet.</p>
        ) : (
          <ul className="text-sm text-gray-700 space-y-1">
            {assignments.map((assignment) => (
              <li key={assignment.id}>{assignment.guide_name}</li>
            ))}
          </ul>
        )}
      </section>

      {isLoading && <p>Loading trip parties…</p>}
      {error && (
        <p className="text-sm text-red-600">
          Unable to load parties for this trip. Please retry.
        </p>
      )}

      {!isLoading && !error && (
        <div className="space-y-6">
          {hasParties ? (
            <PartySummaryList parties={parties} />
          ) : (
            <div className="border border-dashed rounded-md p-4 bg-slate-50 text-sm text-gray-600">
              No parties yet. Create one to send payment and info links to your guests.
            </div>
          )}

          {(!hasParties || showAdvancedForm) && (
            <CreatePartyForm trip={formTrip} onClose={onClose} onCreated={handleCreated} />
          )}

          {hasParties && !showAdvancedForm && (
            <div className="space-y-3">
              <details className="bg-slate-100 rounded-md p-4">
                <summary className="cursor-pointer font-medium text-sm text-gray-700">
                  Advanced: add another party to this trip
                </summary>
                <p className="text-xs text-gray-600 mt-2">
                  Most trips only need one party. Add another party when separate groups
                  should manage payment or guest details independently.
                </p>
                <button
                  type="button"
                  onClick={() => setShowAdvancedForm(true)}
                  className="mt-3 text-sm text-blue-600 underline"
                >
                  Add another party
                </button>
              </details>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

function PartySummaryList({ parties }: { parties: TripPartySummary[] }){
  return (
    <div className="space-y-4">
      {parties.map(party => (
        <article key={party.id} className="border rounded-md p-4 bg-slate-50 space-y-3">
          <header>
            <h3 className="text-lg font-semibold">
              {party.primary_guest_name || party.primary_guest_email || 'Guest party'}
            </h3>
            <p className="text-xs text-gray-500">
              Created {new Date(party.created_at).toLocaleString()} · Party size {party.party_size}
            </p>
          </header>
          <dl className="grid sm:grid-cols-3 gap-3 text-sm">
            <StatusChip label="Payment" value={party.payment_status} />
            <StatusChip label="Guest info" value={party.info_status} />
            <StatusChip label="Waivers" value={party.waiver_status} />
          </dl>

          <div className="space-y-2 text-sm">
            <p className="font-medium text-gray-700">Guests in this party</p>
            <ul className="space-y-1">
              {party.guests.map(guest => (
                <li key={guest.id} className="flex items-center gap-2">
                  <span>{guest.full_name || guest.email || 'Guest'}</span>
                  {guest.email && <span className="text-xs text-gray-500">({guest.email})</span>}
                  {guest.is_primary && (
                    <span className="text-xs text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full">Primary</span>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {party.payment_preview_url && (
            <div className="text-sm">
              <p className="font-medium text-gray-700">Payment link</p>
              <a
                href={party.payment_preview_url}
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 underline break-all"
              >
                {party.payment_preview_url}
              </a>
            </div>
          )}
        </article>
      ))}
    </div>
  )
}

function StatusChip({ label, value }: { label: string; value: string }){
  return (
    <div className="space-y-1">
      <dt className="text-xs uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="text-sm font-medium text-gray-700">{value}</dd>
    </div>
  )
}
