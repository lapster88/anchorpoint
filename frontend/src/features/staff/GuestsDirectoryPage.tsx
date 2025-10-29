import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { GuestProfile, listGuests, requestGuestLink } from './api'

export default function GuestsDirectoryPage(){
  const [query, setQuery] = useState('')
  const queryClient = useQueryClient()

  const { data, isLoading, error } = useQuery({
    queryKey: ['staff-guests', query],
    queryFn: () => listGuests(query.trim())
  })

  const linkMutation = useMutation({
    mutationFn: ({ guestId, partyId }: { guestId: number; partyId: number }) =>
      requestGuestLink({ guest_id: guestId, party_id: partyId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['staff-guests'] })
  })

  const guests = useMemo(() => data ?? [], [data])

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Guests</h1>
        <p className="text-gray-600 text-sm">
          Search and manage guest profiles. Email guests their magic link when they need to update details.
        </p>
      </header>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <input
          type="search"
          placeholder="Search by email or name"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="border rounded px-3 py-2 w-full sm:w-80"
        />
      </div>

      {isLoading && <p>Loading guests…</p>}
      {error && <p className="text-sm text-red-600">Unable to load guests.</p>}

      <div className="space-y-4">
        {guests.map(guest => (
          <GuestCard
            key={guest.id}
            guest={guest}
            onSendLink={(partyId) => linkMutation.mutate({ guestId: guest.id, partyId })}
            sending={linkMutation.isPending}
          />
        ))}
        {!isLoading && !guests.length && (
          <p className="text-sm text-gray-500">No guests found.</p>
        )}
      </div>
    </div>
  )
}

type GuestCardProps = {
  guest: GuestProfile
  onSendLink: (partyId: number) => void
  sending: boolean
}

function GuestCard({ guest, onSendLink, sending }: GuestCardProps){
  return (
    <article className="border rounded bg-white shadow-sm p-4 space-y-3">
      <div>
        <h2 className="text-lg font-semibold">{guest.full_name || guest.email}</h2>
        <p className="text-sm text-gray-600">{guest.email}</p>
        {guest.phone && <p className="text-sm text-gray-600">Phone: {guest.phone}</p>}
      </div>

      {guest.parties?.length ? (
        <div className="text-sm text-gray-700 space-y-1">
          <p className="font-medium">Trip history</p>
          <ul className="space-y-2">
            {guest.parties.map(party => (
              <li key={party.id} className="border rounded px-3 py-2 bg-slate-50">
                <p className="font-medium">{party.trip_title}</p>
                <p className="text-xs text-gray-600">
                  {new Date(party.trip_start).toLocaleDateString()} – {new Date(party.trip_end).toLocaleDateString()}
                </p>
                <p className="text-xs text-gray-600">
                  Payment: {party.payment_status} · Waiver: {party.waiver_status} · Info: {party.info_status}
                </p>
                <div className="mt-2">
                  <button
                    type="button"
                    className="text-xs text-blue-600 underline disabled:opacity-50"
                    onClick={() => onSendLink(party.id)}
                    disabled={sending}
                  >
                    {sending ? 'Sending…' : 'Email guest link'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-gray-500">No trips recorded yet.</p>
      )}
    </article>
  )
}
