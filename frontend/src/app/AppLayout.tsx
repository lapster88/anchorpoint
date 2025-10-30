import { PropsWithChildren, useCallback } from 'react'
import { Link } from 'react-router-dom'

import { useAuth } from '../lib/auth'
import { useMemberships } from '../lib/memberships'

export const AppLayout = ({ children }: PropsWithChildren) => {
  const { user, logout } = useAuth()
  const { serviceLabel, canManageGuests, canManageService } = useMemberships()

  const handleLogout = useCallback(() => {
    if (window.confirm('Sign out of Anchorpoint?')) {
      logout()
    }
  }, [logout])

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
      {children}
    </div>
  )
}
