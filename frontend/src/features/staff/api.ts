import { api } from '../../lib/api'

export type GuestProfile = {
  id: number
  email: string
  first_name: string | null
  last_name: string | null
  full_name: string | null
  phone: string | null
  updated_at: string
  parties: Array<{
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

export async function requestGuestLink(payload: { guest_id: number; party_id: number; ttl_hours?: number }): Promise<void> {
  await api.post('/api/guest-links/', payload)
}

export type CreatePartyPayload = {
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
  additional_guests?: Array<CreatePartyPayload['primary_guest']>
  party_size?: number
}

export type CreatePartyResponse = {
  id: number
  trip: number
  party_size: number
  payment_status: string
  info_status: string
  waiver_status: string
  payment_url: string | null
  guest_portal_url: string | null
}

export async function createParty(tripId: number, payload: CreatePartyPayload): Promise<CreatePartyResponse> {
  const { data } = await api.post<CreatePartyResponse>(`/api/trips/${tripId}/parties/`, payload)
  return data
}

export type TripPartyGuest = {
  id: number
  full_name: string | null
  email: string
  is_primary: boolean
}

export type TripPartySummary = {
  id: number
  trip_id: number
  primary_guest_name: string | null
  primary_guest_email: string | null
  party_size: number
  payment_status: string
  info_status: string
  waiver_status: string
  created_at: string
  payment_preview_url: string | null
  guests: TripPartyGuest[]
  price_per_guest_cents: number
  price_per_guest: string
  total_amount_cents: number
  total_amount: string
}

export async function listTripParties(tripId: number): Promise<TripPartySummary[]> {
  const { data } = await api.get<{ parties: TripPartySummary[] }>(`/api/trips/${tripId}/parties/`)
  return data.parties
}
