import { api } from '../../lib/api'

export type TripTemplate = {
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
  created_at: string
  updated_at: string
}

export type TripTemplatePayload = {
  service: number
  title: string
  duration_hours: number
  location: string
  pricing_currency: string
  is_deposit_required: boolean
  deposit_percent: string
  pricing_tiers: TripTemplate['pricing_tiers']
  target_client_count: number
  target_guide_count: number
  notes?: string
  is_active: boolean
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

export const duplicateTripTemplate = async (id: number): Promise<TripTemplate> => {
  const { data } = await api.post<TripTemplate>(`/api/trip-templates/${id}/duplicate/`)
  return data
}

export type ServiceUser = {
  id: number
  email: string
  first_name: string | null
  last_name: string | null
  display_name: string | null
  last_login?: string | null
}

export type ServiceMember = {
  id: number
  guide_service: number
  role: string
  is_active: boolean
  user: ServiceUser
  invited_by: ServiceUser | null
  invited_at: string | null
  accepted_at: string | null
  created_at: string
  updated_at: string
}

export type ServiceInvitation = {
  id: number
  guide_service: number
  email: string
  role: string
  status: string
  expires_at: string
  invited_by: ServiceUser | null
  invited_at: string
  accepted_at: string | null
  cancelled_at: string | null
  accept_url: string
}

export type ServiceRosterResponse = {
  members: ServiceMember[]
  invitations: ServiceInvitation[]
}

export const fetchServiceRoster = async (serviceId: number): Promise<ServiceRosterResponse> => {
  const { data } = await api.get<ServiceRosterResponse>(`/api/orgs/${serviceId}/members/`)
  return data
}

export const inviteServiceMember = async (
  serviceId: number,
  payload: { email: string; role: string }
): Promise<{ member?: ServiceMember; invitation?: ServiceInvitation }> => {
  const { data } = await api.post<{ member?: ServiceMember; invitation?: ServiceInvitation }>(
    `/api/orgs/${serviceId}/members/`,
    payload
  )
  return data
}

export const updateServiceMember = async (
  serviceId: number,
  membershipId: number,
  payload: Partial<{ role: string; is_active: boolean }>
): Promise<{ member: ServiceMember }> => {
  const { data } = await api.patch<{ member: ServiceMember }>(
    `/api/orgs/${serviceId}/members/${membershipId}/`,
    payload
  )
  return data
}

export const deleteServiceMember = async (serviceId: number, membershipId: number): Promise<void> => {
  await api.delete(`/api/orgs/${serviceId}/members/${membershipId}/`)
}

export const resendServiceInvitation = async (
  serviceId: number,
  invitationId: number
): Promise<{ invitation: ServiceInvitation }> => {
  const { data } = await api.post<{ invitation: ServiceInvitation }>(
    `/api/orgs/${serviceId}/invitations/${invitationId}/resend/`,
    {}
  )
  return data
}

export const cancelServiceInvitation = async (serviceId: number, invitationId: number): Promise<void> => {
  await api.delete(`/api/orgs/${serviceId}/invitations/${invitationId}/`)
}

export type InvitationStatus = {
  email: string
  role: string
  status: string
  expires_at: string
  service_name: string
}

export const fetchInvitationStatus = async (token: string): Promise<InvitationStatus> => {
  const { data } = await api.get<InvitationStatus>(`/api/auth/invitations/${token}/`)
  return data
}

export type InvitationAcceptPayload = Partial<{
  password: string
  first_name: string
  last_name: string
  display_name: string
}>

export type InvitationAcceptResponse = {
  membership: ServiceMember
  user: ServiceUser
  access?: string
  refresh?: string
}

export const acceptInvitation = async (
  token: string,
  payload: InvitationAcceptPayload
): Promise<InvitationAcceptResponse> => {
  const { data } = await api.post<InvitationAcceptResponse>(
    `/api/auth/invitations/${token}/accept/`,
    payload
  )
  return data
}
