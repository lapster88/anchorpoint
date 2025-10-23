import { api } from '../../lib/api'
import { CreatePartyPayload, TripPartySummary } from '../staff/api'

export type TripAssignment = {
  id: number
  guide_id: number
  guide_name: string
}

export type TripDetail = {
  id: number
  guide_service: number
  guide_service_name: string
  title: string
  location: string
  start: string
  end: string
  capacity: number
  price_cents: number
  difficulty: string | null
  description: string
  parties: TripPartySummary[]
  assignments: TripAssignment[]
  requires_assignment: boolean
}

export type CreateTripPayload = {
  guide_service: number
  title: string
  location: string
  start: string
  end: string
  capacity: number
  price_cents: number
  difficulty?: string | null
  description?: string
  guides?: number[]
  party: CreatePartyPayload
}

export async function createTrip(payload: CreateTripPayload): Promise<TripDetail> {
  const { data } = await api.post<TripDetail>('/api/trips/', payload)
  return data
}

export type GuideOption = {
  id: number
  display_name: string | null
  first_name: string | null
  last_name: string | null
  email: string
}

export async function listServiceGuides(serviceId: number): Promise<GuideOption[]> {
  const { data } = await api.get<GuideOption[]>(`/api/trips/service/${serviceId}/guides/`)
  return data
}

export async function assignGuides(tripId: number, guideIds: number[]): Promise<TripDetail> {
  const { data } = await api.post<TripDetail>(`/api/trips/${tripId}/assign-guides/`, { guide_ids: guideIds })
  return data
}

export async function getTrip(tripId: number): Promise<TripDetail> {
  const { data } = await api.get<TripDetail>(`/api/trips/${tripId}/`)
  return data
}
