import { Routes, Route, Link, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import AuthPage from '../features/auth/AuthPage'
import TripsList from '../features/trips/TripsList'
import ProfilePage from '../features/profile/ProfilePage'
import GuideAvailabilityCalendar from '../features/availability/GuideAvailabilityCalendar'
import ServiceSettingsPage from '../features/service/ServiceSettingsPage'
import ServiceRosterPage from '../features/service/ServiceRosterPage'
import { useAuth } from '../lib/auth'
import GuestsDirectoryPage from '../features/staff/GuestsDirectoryPage'
import { fetchMemberships } from '../features/profile/api'
import CheckoutPreviewPage from '../features/payments/CheckoutPreviewPage'
import InvitationAcceptPage from '../features/auth/InvitationAcceptPage'

export default function App(){
  const { isAuthenticated, user, logout } = useAuth()
  const location = useLocation()
  const { data: memberships } = useQuery({
    queryKey: ['memberships'],
    queryFn: fetchMemberships,
    enabled: isAuthenticated
  })
  const serviceLabel = (() => {
    if (!memberships || memberships.length === 0) return null
    const activeMemberships = memberships.filter(m => m.is_active)
    if (activeMemberships.length === 0) return null
    const ownerService = activeMemberships.find(m => ['OWNER', 'OFFICE_MANAGER', 'GUEST'].includes(m.role))
    if (ownerService) {
      const uniqueServices = new Set(activeMemberships.filter(m => ['OWNER', 'OFFICE_MANAGER', 'GUEST'].includes(m.role)).map(m => m.guide_service_name))
      if (uniqueServices.size === 1) {
        return uniqueServices.values().next().value as string
      }
      return 'Multiple services'
    }
    const uniqueServices = new Set(activeMemberships.map(m => m.guide_service_name))
    if (uniqueServices.size === 1) {
      return uniqueServices.values().next().value as string
    }
    return 'Multiple services'
  })()

  const canManageGuests = memberships?.some(m => (
    m.is_active && ['OWNER', 'OFFICE_MANAGER'].includes(m.role)
  )) ?? false
  const canManageService = canManageGuests
  // Ask for confirmation before wiping local auth state.
  const handleLogout = () => {
    if (window.confirm('Sign out of Anchorpoint?')) {
      logout()
    }
  }

  if (!isAuthenticated) {
    if (location.pathname.startsWith('/invitations/')) {
      return (
        <Routes>
          <Route path="/invitations/:token" element={<InvitationAcceptPage />} />
          <Route path="*" element={<AuthPage />} />
        </Routes>
      )
    }
    return <AuthPage />
  }

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Anchorpoint</h1>
          {serviceLabel && <p className="text-xs text-gray-500 mt-1">{serviceLabel}</p>}
        </div>
        <nav className="space-x-4 flex items-center gap-3">
          <Link to="/" className="underline">Trips</Link>
          <Link to="/calendar" className="underline">Calendar</Link>
          {canManageService && <Link to="/service-settings" className="underline">Service Settings</Link>}
          {canManageService && <Link to="/service-roster" className="underline">Service Roster</Link>}
          <Link to="/profile" className="underline">Profile</Link>
          {canManageGuests && <Link to="/guests" className="underline">Guests</Link>}
          <span className="text-sm text-gray-600">Signed in as {user?.display_name || user?.email}</span>
          <button type="button" onClick={handleLogout} className="text-sm underline text-red-600">Logout</button>
        </nav>
      </header>
      <Routes>
        <Route path="/" element={<TripsList/>} />
        <Route path="/calendar" element={<GuideAvailabilityCalendar/>} />
        {canManageService && <Route path="/service-settings" element={<ServiceSettingsPage/>} />}
        {canManageService && <Route path="/service-roster" element={<ServiceRosterPage />} />}
        <Route path="/profile" element={<ProfilePage/>} />
        <Route path="/payments/preview" element={<CheckoutPreviewPage />} />
        {canManageGuests && <Route path="/guests" element={<GuestsDirectoryPage/>} />}
        <Route path="/invitations/:token" element={<InvitationAcceptPage />} />
      </Routes>
    </div>
  )
}
