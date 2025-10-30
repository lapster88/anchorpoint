import { useCallback, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useMemberships } from '../../lib/memberships'
import TripPartyManager from '../staff/TripPartyManager'
import CreateTripForm from './CreateTripForm'
import TripGuideDetails from './TripGuideDetails'
import { TripAssignment, TripDetail, TripPricingSnapshot } from './api'

export type Trip = {
  id: number
  title: string
  location: string
  start: string
  end: string
  price_cents: number
  guide_service: number
  guide_service_name: string
  assignments: TripAssignment[]
  requires_assignment: boolean
  pricing_snapshot?: TripPricingSnapshot | null
  target_clients_per_guide?: number | null
  duration_hours: number | null
  duration_days: number | null
  timing_mode: 'single_day' | 'multi_day'
}

export default function TripsList(){
  const { isAuthenticated } = useAuth()
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null)
  const [guideTrip, setGuideTrip] = useState<Trip | null>(null)
  const [creatingTrip, setCreatingTrip] = useState(false)
  const { data, isLoading, error } = useQuery({
    queryKey: ['trips'],
    queryFn: async () => (await api.get('/api/trips/')).data,
    // Avoid calling the API before the user completes authentication.
    enabled: isAuthenticated
  })
  const {
    canManageService,
    activeServiceId,
    activeServiceName,
    showServiceLabel,
    isGuide,
  } = useMemberships()

  const canManageBookings = canManageService

  const results: Trip[] = (data?.results || data || []) as Trip[]
  const tripsWithDefaults = useMemo(
    () =>
      (results ?? []).map((trip) => ({
        ...trip,
        assignments: trip.assignments ?? [],
        requires_assignment:
          trip.requires_assignment ?? (trip.assignments && trip.assignments.length > 0 ? false : true),
      })),
    [results]
  )

  const handleTripUpdate = useCallback((detail: TripDetail) => {
    setSelectedTrip((prev) => {
      if (!prev || prev.id !== detail.id) return prev
      return {
        ...prev,
        title: detail.title,
        location: detail.location,
        start: detail.start,
        end: detail.end,
        price_cents: detail.price_cents,
        guide_service: detail.guide_service,
        guide_service_name: detail.guide_service_name,
        assignments: detail.assignments,
        requires_assignment: detail.requires_assignment,
        target_clients_per_guide: detail.target_clients_per_guide,
        pricing_snapshot: detail.pricing_snapshot,
        duration_hours: detail.duration_hours,
        duration_days: detail.duration_days,
        timing_mode: detail.timing_mode,
      }
    })
  }, [])

  const formatTripTiming = useCallback((trip: Trip) => {
    const startDate = new Date(trip.start)
    if (Number.isNaN(startDate.getTime())) {
      return 'Unscheduled'
    }
    if (trip.timing_mode === 'single_day') {
      const startTime = startDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
      const duration =
        trip.duration_hours ??
        Math.max(
          1,
          Math.round((new Date(trip.end).getTime() - startDate.getTime()) / 3600000)
        )
      return `${startDate.toLocaleDateString()} · ${startTime} · ${duration}h`
    }
    const endDate = new Date(trip.end)
    const dayCount =
      trip.duration_days ??
      Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / 86400000))
    const durationLabel = dayCount ? `${dayCount} day${dayCount === 1 ? '' : 's'}` : ''
    return `${startDate.toLocaleDateString()} → ${endDate.toLocaleDateString()}${durationLabel ? ` · ${durationLabel}` : ''}`
  }, [])

  if (!isAuthenticated) return null
  if (isLoading) return <div>Loading…</div>
  if (error) return <div className="text-red-600">Failed to load trips</div>

  return (
    <div className="space-y-6">
      {canManageBookings && (
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-semibold">Trips</h2>
          <button
            type="button"
            className="bg-blue-600 text-white text-sm px-4 py-2 rounded disabled:opacity-50"
            onClick={() => setCreatingTrip(true)}
            disabled={!activeServiceId}
          >
            Create trip
          </button>
        </div>
      )}
      {creatingTrip && canManageBookings && (
        <CreateTripForm
          serviceId={activeServiceId ?? null}
          serviceName={activeServiceName}
          onClose={() => setCreatingTrip(false)}
          onCreated={(tripDetail) => {
            setCreatingTrip(false)
            setSelectedTrip({
              id: tripDetail.id,
              title: tripDetail.title,
              location: tripDetail.location,
              start: tripDetail.start,
              end: tripDetail.end,
              price_cents: tripDetail.price_cents,
              guide_service: tripDetail.guide_service,
              guide_service_name: tripDetail.guide_service_name,
              assignments: tripDetail.assignments,
              requires_assignment: tripDetail.requires_assignment,
              target_clients_per_guide: tripDetail.target_clients_per_guide,
              pricing_snapshot: tripDetail.pricing_snapshot,
              duration_hours: tripDetail.duration_hours,
              duration_days: tripDetail.duration_days,
              timing_mode: tripDetail.timing_mode,
            })
          }}
        />
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {tripsWithDefaults?.map((t: Trip) => (
          <div key={t.id} className="card space-y-2">
            <h3 className="text-xl font-semibold">{t.title}</h3>
            <p className="text-sm text-gray-700">{t.location}</p>
            <p className="text-xs text-gray-500">{formatTripTiming(t)}</p>
            {showServiceLabel && (
              <p className="text-xs text-gray-500">{t.guide_service_name}</p>
            )}
            {canManageBookings && t.requires_assignment && (
              <span className="inline-flex items-center text-xs font-medium bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">Needs guide assignment</span>
            )}
            {canManageBookings && (
              <button
                type="button"
                className="text-sm text-blue-600 underline"
                onClick={() => setSelectedTrip(t)}
              >
                Manage trip
              </button>
            )}
            {isGuide && (
              <button
                type="button"
                className="text-sm text-blue-600 underline"
                onClick={() => setGuideTrip(t)}
              >
                View details
              </button>
            )}
          </div>
        ))}
        {!results?.length && <div>No trips yet.</div>}
      </div>
      {selectedTrip && canManageBookings && (
        <TripPartyManager
          trip={{
            id: selectedTrip.id,
            title: selectedTrip.title,
            location: selectedTrip.location,
            start: selectedTrip.start,
            end: selectedTrip.end,
            price_cents: selectedTrip.price_cents,
            guide_service: selectedTrip.guide_service,
            guide_service_name: selectedTrip.guide_service_name,
            assignments: selectedTrip.assignments,
            requires_assignment: selectedTrip.requires_assignment,
            target_clients_per_guide: selectedTrip.target_clients_per_guide,
            pricing_snapshot: selectedTrip.pricing_snapshot,
            timing_mode: selectedTrip.timing_mode,
            duration_hours: selectedTrip.duration_hours,
            duration_days: selectedTrip.duration_days,
          }}
          onClose={() => setSelectedTrip(null)}
          canEditAssignments={canManageBookings}
          serviceId={selectedTrip.guide_service}
          onTripUpdate={handleTripUpdate}
        />
      )}
      {guideTrip && (
        <TripGuideDetails trip={guideTrip} onClose={() => setGuideTrip(null)} />
      )}
    </div>
  )
}
