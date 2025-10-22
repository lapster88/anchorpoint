import { api } from '../../lib/api'

export type GuestProfile = {
  id: number
  email: string
  first_name: string | null
  last_name: string | null
  full_name: string | null
  phone: string | null
  updated_at: string
  bookings: Array<{
    id: number
    trip_title: string
    trip_start: string
    trip_end: string
    party_size: number
    payment_status: string
    info_status: string
    waiver_status: string
    last_guest_activity_at: string | null
  }>
}

export async function listGuests(query: string): Promise<GuestProfile[]> {
  const params = query ? { q: query } : undefined
  const { data } = await api.get<GuestProfile[]>('/api/guests/', { params })
  return data
}

export async function requestGuestLink(payload: { guest_id: number; booking_id?: number; ttl_hours?: number }): Promise<void> {
  await api.post('/api/guest-links/', payload)
}
