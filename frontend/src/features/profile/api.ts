import { api } from '../../lib/api'

export type GuideAvailability = {
  id: number
  guide_service: number | null
  guide_service_name?: string | null
  trip: number | null
  trip_title?: string | null
  start: string
  end: string
  is_available: boolean
  source: string
  source_display: string
  visibility: 'private' | 'busy' | 'detail'
  note: string
  created_at: string
  updated_at: string
}

export type AvailabilityShare = {
  id: number
  guide_service: number
  guide_service_name: string
  visibility: 'private' | 'busy' | 'detail'
}

export type ServiceMembership = {
  id: number
  guide_service: number
  guide_service_name: string
  guide_service_logo_url: string | null
  role: string
  is_active: boolean
}

export type GuideServiceSettings = {
  id: number
  name: string
  slug: string
  contact_email: string
  phone: string
  logo_url: string | null
}

export type StripeAccountStatus = {
  connected: boolean
  account_id?: string | null
  charges_enabled?: boolean
  payouts_enabled?: boolean
  details_submitted?: boolean
  default_currency?: string | null
  account_email?: string | null
  express_dashboard_url?: string
  onboarding_link_url?: string
  onboarding_expires_at?: string | null
  last_webhook_received_at?: string | null
  last_webhook_error_at?: string | null
  last_webhook_error_message?: string
}

export type CalendarIntegration = {
  id: number
  provider: string
  provider_display: string
  external_id: string
  is_active: boolean
  sync_config: Record<string, unknown>
  last_synced_at: string | null
  created_at: string
  updated_at: string
}

export type AvailabilityInput = {
  guide_service?: number | null
  start: string
  end: string
  is_available: boolean
  visibility: 'private' | 'busy' | 'detail'
  note?: string
}

export const fetchAvailabilities = async (): Promise<GuideAvailability[]> => {
  const { data } = await api.get<GuideAvailability[]>('/api/auth/availabilities/')
  return data
}

export const createAvailability = async (payload: AvailabilityInput): Promise<GuideAvailability> => {
  const { data } = await api.post<GuideAvailability>('/api/auth/availabilities/', payload)
  return data
}

export const updateAvailability = async (
  id: number,
  payload: Partial<Omit<AvailabilityInput, 'start' | 'end'>> & { start?: string; end?: string }
): Promise<GuideAvailability> => {
  const { data } = await api.patch<GuideAvailability>(`/api/auth/availabilities/${id}/`, payload)
  return data
}

export const deleteAvailability = async (id: number): Promise<void> => {
  await api.delete(`/api/auth/availabilities/${id}/`)
}

export const fetchAvailabilityShares = async (availabilityId: number): Promise<AvailabilityShare[]> => {
  const { data } = await api.get<AvailabilityShare[]>(`/api/auth/availabilities/${availabilityId}/shares/`)
  return data
}

export const addAvailabilityShare = async (
  availabilityId: number,
  payload: { guide_service: number; visibility: 'private' | 'busy' | 'detail' }
): Promise<AvailabilityShare> => {
  const { data } = await api.post<AvailabilityShare>(
    `/api/auth/availabilities/${availabilityId}/shares/`,
    payload
  )
  return data
}

export const removeAvailabilityShare = async (availabilityId: number, guideServiceId: number): Promise<void> => {
  await api.delete(`/api/auth/availabilities/${availabilityId}/shares/`, {
    params: { guide_service: guideServiceId }
  })
}

export const fetchMemberships = async (): Promise<ServiceMembership[]> => {
  const { data } = await api.get<ServiceMembership[]>('/api/auth/memberships/')
  return data
}

export const fetchCalendarIntegrations = async (): Promise<CalendarIntegration[]> => {
  const { data } = await api.get<CalendarIntegration[]>('/api/auth/calendar-integrations/')
  return data
}

export const getGuideServiceSettings = async (serviceId: number): Promise<GuideServiceSettings> => {
  const { data } = await api.get<GuideServiceSettings>(`/api/orgs/${serviceId}/`)
  return data
}

export const uploadGuideServiceLogo = async (serviceId: number, file: File): Promise<GuideServiceSettings> => {
  const form = new FormData()
  form.append('logo', file)
  const { data } = await api.post<GuideServiceSettings>(`/api/orgs/${serviceId}/logo/`, form, {
    headers: { 'Content-Type': 'multipart/form-data' }
  })
  return data
}

export const deleteGuideServiceLogo = async (serviceId: number): Promise<void> => {
  await api.delete(`/api/orgs/${serviceId}/logo/`)
}

export const fetchStripeAccountStatus = async (serviceId: number): Promise<StripeAccountStatus> => {
  const { data } = await api.get<StripeAccountStatus>(`/api/orgs/${serviceId}/stripe/status/`)
  return data
}

export const createStripeOnboardingLink = async (
  serviceId: number
): Promise<{ url: string; expires_at: string }> => {
  const { data } = await api.post<{ url: string; expires_at: string }>(
    `/api/orgs/${serviceId}/stripe/link/`
  )
  return data
}

export const disconnectStripeAccount = async (serviceId: number): Promise<void> => {
  await api.post(`/api/orgs/${serviceId}/stripe/disconnect/`)
}

export const createCalendarIntegration = async (
  payload: Pick<CalendarIntegration, 'provider' | 'external_id' | 'is_active'> & {
    sync_config?: Record<string, unknown>
  }
): Promise<CalendarIntegration> => {
  const { data } = await api.post<CalendarIntegration>('/api/auth/calendar-integrations/', payload)
  return data
}

export const updateCalendarIntegration = async (
  id: number,
  payload: Partial<Pick<CalendarIntegration, 'external_id' | 'is_active' | 'sync_config'>>
): Promise<CalendarIntegration> => {
  const { data } = await api.patch<CalendarIntegration>(
    `/api/auth/calendar-integrations/${id}/`,
    payload
  )
  return data
}

export const deleteCalendarIntegration = async (id: number): Promise<void> => {
  await api.delete(`/api/auth/calendar-integrations/${id}/`)
}
