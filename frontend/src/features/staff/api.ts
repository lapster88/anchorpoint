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

export type CreateBookingPayload = {
  primary_guest: {
    email: string
    first_name?: string
    last_name?: string
    phone?: string
    date_of_birth?: string
    emergency_contact_name?: string
    emergency_contact_phone?: string
    medical_notes?: string
    dietary_notes?: string
  }
  additional_guests?: Array<CreateBookingPayload['primary_guest']>
  party_size?: number
}

export type CreateBookingResponse = {
  id: number
  trip: number
  party_size: number
  payment_status: string
  info_status: string
  waiver_status: string
  payment_url: string | null
  guest_portal_url: string | null
}

export async function createBooking(tripId: number, payload: CreateBookingPayload): Promise<CreateBookingResponse> {
  const { data } = await api.post<CreateBookingResponse>(`/api/trips/${tripId}/bookings/`, payload)
  return data
}
