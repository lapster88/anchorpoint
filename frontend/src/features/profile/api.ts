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
  role: string
  is_active: boolean
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
