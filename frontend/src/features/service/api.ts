import { api } from '../../lib/api'

export type PricingTier = {
  id?: number
  min_guests: number
  max_guests: number | null
  price_per_guest: string
}

export type PricingModel = {
  id: number
  service: number
  name: string
  description: string
  default_location: string
  currency: string
  is_deposit_required: boolean
  deposit_percent: string
  tiers: PricingTier[]
  created_at: string
  updated_at: string
}

export type PricingModelPayload = {
  service: number
  name: string
  description?: string
  default_location?: string
  currency: string
  is_deposit_required: boolean
  deposit_percent: string
  tiers: PricingTier[]
}

export type TripTemplate = {
  id: number
  service: number
  title: string
  duration_hours: number
  location: string
  pricing_model: number
  pricing_model_name: string
  target_client_count: number
  target_guide_count: number
  notes: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export type TripTemplatePayload = {
  service: number
  title: string
  duration_hours: number
  location: string
  pricing_model: number
  target_client_count: number
  target_guide_count: number
  notes?: string
  is_active: boolean
}

export const listPricingModels = async (serviceId: number): Promise<PricingModel[]> => {
  const { data } = await api.get<PricingModel[]>('/api/pricing-models/', {
    params: { service: serviceId }
  })
  return data
}

export const createPricingModel = async (payload: PricingModelPayload): Promise<PricingModel> => {
  const { data } = await api.post<PricingModel>('/api/pricing-models/', payload)
  return data
}

export const updatePricingModel = async (
  id: number,
  payload: PricingModelPayload
): Promise<PricingModel> => {
  const { data } = await api.put<PricingModel>(`/api/pricing-models/${id}/`, payload)
  return data
}

export const deletePricingModel = async (id: number): Promise<void> => {
  await api.delete(`/api/pricing-models/${id}/`)
}

export const listTripTemplates = async (serviceId: number): Promise<TripTemplate[]> => {
  const { data } = await api.get<TripTemplate[]>('/api/trip-templates/', {
    params: { service: serviceId }
  })
  return data
}

export const createTripTemplate = async (payload: TripTemplatePayload): Promise<TripTemplate> => {
  const { data } = await api.post<TripTemplate>('/api/trip-templates/', payload)
  return data
}

export const updateTripTemplate = async (
  id: number,
  payload: TripTemplatePayload
): Promise<TripTemplate> => {
  const { data } = await api.put<TripTemplate>(`/api/trip-templates/${id}/`, payload)
  return data
}

export const deleteTripTemplate = async (id: number): Promise<void> => {
  await api.delete(`/api/trip-templates/${id}/`)
}
