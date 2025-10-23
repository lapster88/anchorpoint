import { api } from '../../lib/api'

export type FetchGuestProfileResponse = {
  id: number
  email: string
  first_name: string | null
  last_name: string | null
  phone: string | null
  date_of_birth: string | null
  emergency_contact_name: string | null
  emergency_contact_phone: string | null
  medical_notes: string | null
  dietary_notes: string | null
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

export type UpdateGuestProfilePayload = {
  first_name: string
  last_name: string
  phone: string
  date_of_birth?: string | null
  emergency_contact_name: string
  emergency_contact_phone: string
  medical_notes?: string
  dietary_notes?: string
}

export async function fetchGuestProfile(token: string, signal?: AbortSignal): Promise<FetchGuestProfileResponse>{
  const { data } = await api.get<FetchGuestProfileResponse>(`/api/guest-access/${token}/profile/`, { signal })
  return data
}

export async function updateGuestProfile(token: string, payload: UpdateGuestProfilePayload): Promise<FetchGuestProfileResponse>{
  const { data } = await api.patch<FetchGuestProfileResponse>(`/api/guest-access/${token}/profile/`, payload)
  return data
}
