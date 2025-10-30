import { PropsWithChildren, createContext, useContext, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'

import { fetchMemberships, ServiceMembership } from '../features/profile/api'
import { useAuth } from './auth'

type MembershipsContextValue = {
  memberships: ServiceMembership[] | undefined
  activeMemberships: ServiceMembership[]
  manageableMemberships: ServiceMembership[]
  canManageGuests: boolean
  canManageService: boolean
  isGuide: boolean
  serviceLabel: string | null
  showServiceLabel: boolean
  activeServiceId: number | null
  activeServiceName?: string
  isLoading: boolean
  isFetching: boolean
  error: unknown
  refetch: () => Promise<ServiceMembership[] | undefined>
}

const MembershipsContext = createContext<MembershipsContextValue | undefined>(undefined)

const MANAGER_ROLES = new Set(['OWNER', 'OFFICE_MANAGER'])
const MANAGED_SERVICE_ROLES = new Set(['OWNER', 'OFFICE_MANAGER', 'GUEST'])

export const MembershipsProvider = ({ children }: PropsWithChildren) => {
  const { isAuthenticated } = useAuth()
  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['memberships'],
    queryFn: fetchMemberships,
    enabled: isAuthenticated,
  })

  const derived = useMemo(() => {
    const memberships = data ?? []
    const activeMemberships = memberships.filter(membership => membership.is_active)
    const manageableMemberships = activeMemberships.filter(membership => MANAGER_ROLES.has(membership.role))
    const managedMembership = activeMemberships.find(membership => MANAGED_SERVICE_ROLES.has(membership.role))
    const uniqueServiceIds = new Set(activeMemberships.map(membership => membership.guide_service))
    const activeServiceId = managedMembership?.guide_service ?? (activeMemberships.length === 1 ? activeMemberships[0].guide_service : null)
    const activeServiceName = activeServiceId
      ? activeMemberships.find(membership => membership.guide_service === activeServiceId)?.guide_service_name
      : undefined
    const canManageGuests = memberships.some(membership => membership.is_active && MANAGER_ROLES.has(membership.role))
    const canManageService = canManageGuests
    const isGuide = activeMemberships.some(membership => membership.role === 'GUIDE')
    const showServiceLabel = isGuide && uniqueServiceIds.size > 1

    const serviceLabel = (() => {
      if (memberships.length === 0) return null
      if (activeMemberships.length === 0) return null

      const managedServices = activeMemberships.filter(membership => MANAGED_SERVICE_ROLES.has(membership.role))
      if (managedServices.length > 0) {
        const uniqueServices = new Set(managedServices.map(membership => membership.guide_service_name))
        if (uniqueServices.size === 1) {
          return managedServices[0]?.guide_service_name ?? null
        }
        return 'Multiple services'
      }

      const uniqueActiveServices = new Set(activeMemberships.map(membership => membership.guide_service_name))
      if (uniqueActiveServices.size === 1) {
        return activeMemberships[0]?.guide_service_name ?? null
      }
      return 'Multiple services'
    })()

    return {
      memberships: data,
      activeMemberships,
      manageableMemberships,
      canManageGuests,
      canManageService,
      isGuide,
      serviceLabel,
      showServiceLabel,
      activeServiceId,
      activeServiceName,
    }
  }, [data])

  const value = useMemo<MembershipsContextValue>(
    () => ({
      ...derived,
      memberships: derived.memberships,
      isLoading,
      isFetching,
      error,
      refetch: async () => {
        const result = await refetch()
        return result.data
      },
    }),
    [derived, error, isFetching, isLoading, refetch]
  )

  return <MembershipsContext.Provider value={value}>{children}</MembershipsContext.Provider>
}

export const useMemberships = () => {
  const context = useContext(MembershipsContext)
  if (!context) {
    throw new Error('useMemberships must be used within a MembershipsProvider')
  }
  return context
}
