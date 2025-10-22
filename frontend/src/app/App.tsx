import { Routes, Route, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import AuthPage from '../features/auth/AuthPage'
import TripsList from '../features/trips/TripsList'
import ProfilePage from '../features/profile/ProfilePage'
import GuideAvailabilityCalendar from '../features/availability/GuideAvailabilityCalendar'
import { useAuth } from '../lib/auth'
import GuestsDirectoryPage from '../features/staff/GuestsDirectoryPage'
import { fetchMemberships } from '../features/profile/api'

export default function App(){
  const { isAuthenticated, user, logout } = useAuth()
  const { data: memberships } = useQuery({
    queryKey: ['memberships'],
    queryFn: fetchMemberships,
    enabled: isAuthenticated
  })
  const canManageGuests = memberships?.some(m => [
    'OWNER',
    'OFFICE_MANAGER'
  ].includes(m.role)) ?? false
  // Ask for confirmation before wiping local auth state.
  const handleLogout = () => {
    if (window.confirm('Sign out of Anchorpoint?')) {
      logout()
    }
  }

  if (!isAuthenticated) {
    return <AuthPage />
  }

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Anchorpoint</h1>
        <nav className="space-x-4 flex items-center gap-3">
          <Link to="/" className="underline">Trips</Link>
          <Link to="/calendar" className="underline">Calendar</Link>
          <Link to="/profile" className="underline">Profile</Link>
          {canManageGuests && <Link to="/guests" className="underline">Guests</Link>}
          <span className="text-sm text-gray-600">Signed in as {user?.display_name || user?.email}</span>
          <button type="button" onClick={handleLogout} className="text-sm underline text-red-600">Logout</button>
        </nav>
      </header>
      <Routes>
        <Route path="/" element={<TripsList/>} />
        <Route path="/calendar" element={<GuideAvailabilityCalendar/>} />
        <Route path="/profile" element={<ProfilePage/>} />
        {canManageGuests && <Route path="/guests" element={<GuestsDirectoryPage/>} />}
      </Routes>
    </div>
  )
}
