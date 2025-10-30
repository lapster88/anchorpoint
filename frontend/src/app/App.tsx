import { Routes, Route, useLocation } from 'react-router-dom'
import AuthPage from '../features/auth/AuthPage'
import TripsList from '../features/trips/TripsList'
import ProfilePage from '../features/profile/ProfilePage'
import GuideAvailabilityCalendar from '../features/availability/GuideAvailabilityCalendar'
import ServiceSettingsPage from '../features/service/ServiceSettingsPage'
import ServiceRosterPage from '../features/service/ServiceRosterPage'
import { useAuth } from '../lib/auth'
import GuestsDirectoryPage from '../features/staff/GuestsDirectoryPage'
import CheckoutPreviewPage from '../features/payments/CheckoutPreviewPage'
import InvitationAcceptPage from '../features/auth/InvitationAcceptPage'
import { MembershipsProvider, useMemberships } from '../lib/memberships'
import { AppLayout } from './AppLayout'

export default function App(){
  const { isAuthenticated } = useAuth()
  const location = useLocation()

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
    <MembershipsProvider>
      <AuthenticatedApp />
    </MembershipsProvider>
  )
}

function AuthenticatedApp(){
  const { canManageGuests, canManageService } = useMemberships()

  return (
    <AppLayout>
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
    </AppLayout>
  )
}
