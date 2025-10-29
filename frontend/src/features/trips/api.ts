import { api } from '../../lib/api'
import { CreatePartyPayload, TripPartySummary } from '../staff/api'

export type TripPricingTier = {
  min_guests: number
  max_guests: number | null
  price_per_guest: string | null
  price_per_guest_cents: number | null
}

export type TripPricingSnapshot = {
  currency: string
  is_deposit_required: boolean
  deposit_percent: string
  tiers: TripPricingTier[]
}

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
  price_cents: number
  difficulty: string | null
  description: string
  duration_hours: number | null
  target_client_count: number | null
  target_guide_count: number | null
  notes: string | null
  parties: TripPartySummary[]
  assignments: TripAssignment[]
  requires_assignment: boolean
  pricing_snapshot?: TripPricingSnapshot | null
  template_id?: number | null
  template_snapshot?: Record<string, unknown> | null
}

export type CreateTripPayload = {
  guide_service: number
  title?: string
  location?: string
  start: string
  end: string
  price_cents?: number
  difficulty?: string | null
  description?: string
  duration_hours?: number
  target_client_count?: number
  target_guide_count?: number
  notes?: string
  template?: number | null
  guides?: number[]
  party: CreatePartyPayload
}

export async function createTrip(payload: CreateTripPayload): Promise<TripDetail> {
  const { data } = await api.post<TripDetail>('/api/trips/', payload)
  return data
}

export type TripTemplateOption = {
  id: number
  service: number
  title: string
  duration_hours: number
  location: string
  pricing_currency: string
  is_deposit_required: boolean
  deposit_percent: string
  pricing_tiers: Array<{
    min_guests: number
    max_guests: number | null
    price_per_guest: string
  }>
  target_client_count: number
  target_guide_count: number
  notes: string
  is_active: boolean
}

export async function listServiceTripTemplates(serviceId: number): Promise<TripTemplateOption[]> {
  const { data } = await api.get<TripTemplateOption[]>('/api/trip-templates/', {
    params: { service: serviceId }
  })
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
