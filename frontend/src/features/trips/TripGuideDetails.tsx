import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'

import { getTrip, TripDetail, TripAssignment } from './api'

type TripSummary = {
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
}

type Props = {
  trip: TripSummary
  onClose: () => void
}

export default function TripGuideDetails({ trip, onClose }: Props){
  const { data, isLoading, error } = useQuery({
    queryKey: ['trip-detail', trip.id],
    queryFn: () => getTrip(trip.id)
  })

  const detail: TripDetail | null = data ?? null
  const parties = detail?.parties ?? []
  const totalGuests = parties.reduce((sum, party) => sum + party.party_size, 0)
  const assignments: TripAssignment[] = (detail?.assignments ?? trip.assignments ?? []) as TripAssignment[]
  const requiresAssignment = detail?.requires_assignment ?? trip.requires_assignment ?? assignments.length === 0

  const tripDateRange = useMemo(() => {
    const start = new Date(detail?.start ?? trip.start)
    const end = new Date(detail?.end ?? trip.end)
    const sameDay = start.toDateString() === end.toDateString()
    if (sameDay) {
      return `${start.toLocaleString()} – ${end.toLocaleTimeString()}`
    }
    return `${start.toLocaleString()} → ${end.toLocaleString()}`
  }, [detail, trip])

  return (
    <section className="border rounded-lg bg-white shadow-md p-6 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">{detail?.title ?? trip.title}</h2>
          <p className="text-sm text-gray-600">
            {(detail?.location ?? trip.location) ? `${detail?.location ?? trip.location} · ` : ''}{tripDateRange}
          </p>
          {detail?.guide_service_name && (
            <p className="text-xs text-gray-500">{detail.guide_service_name}</p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-sm text-gray-600 underline"
        >
          Close
        </button>
      </header>

      {isLoading && <p>Loading trip details…</p>}
      {error && (
        <p className="text-sm text-red-600">
          Unable to load trip details. Please try again.
        </p>
      )}

      {!isLoading && !error && detail && (
        <div className="space-y-6">
          <section className="bg-slate-100 border border-slate-200 rounded-md px-4 py-3">
            <h3 className="text-sm font-medium text-gray-700">Summary</h3>
            <p className="text-sm text-gray-700 mt-2">Total guests: {totalGuests}</p>
            {assignments.length > 0 ? (
              <ul className="text-sm text-gray-700 space-y-1 mt-2">
                {assignments.map((assignment) => (
                  <li key={assignment.id}>
                    {assignment.guide_name} — {assignment.role.replace('_', ' ').toLowerCase()}
                  </li>
                ))}
              </ul>
            ) : requiresAssignment ? (
              <p className="text-sm text-amber-700 mt-2">No guide assignment recorded for this trip.</p>
            ) : (
              <p className="text-sm text-gray-600 mt-2">Guide assignment data unavailable.</p>
            )}
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-medium text-gray-700">Guests</h3>
            {parties.length === 0 ? (
              <p className="text-sm text-gray-600">No guests are associated with this trip yet.</p>
            ) : (
              parties.map((party) => (
                <article key={party.id} className="border rounded-md px-4 py-3 bg-slate-50 space-y-2">
                  <header>
                    <p className="text-sm font-medium text-gray-700">
                      Party size {party.party_size} · Payment {party.payment_status} · Info {party.info_status} · Waiver {party.waiver_status}
                    </p>
                  </header>
                  <ul className="text-sm text-gray-700 space-y-1">
                    {party.guests.map((guest) => (
                      <li key={guest.id ?? `${party.id}-${guest.email}`}>
                        <span>{guest.full_name || guest.email || 'Guest'}</span>
                        {guest.is_primary && <span className="ml-2 text-xs text-indigo-700">Primary</span>}
                        {guest.email && <span className="ml-2 text-xs text-gray-500">{guest.email}</span>}
                      </li>
                    ))}
                  </ul>
                </article>
              ))
            )}
          </section>
        </div>
      )}
    </section>
  )
}
