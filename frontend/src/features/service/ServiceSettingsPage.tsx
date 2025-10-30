import { useAuth } from '../../lib/auth'
import { useMemberships } from '../../lib/memberships'
import ServiceBrandingCard from '../profile/ServiceBrandingCard'
import ServiceStripeCard from './ServiceStripeCard'
import ServiceTemplatesCard from './ServiceTemplatesCard'

export default function ServiceSettingsPage(){
  const { isAuthenticated } = useAuth()
  const { manageableMemberships, isLoading, error } = useMemberships()

  if (!isAuthenticated) return null

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Service Settings</h1>
        <p className="text-sm text-gray-600">
          Upload your service logo and manage branding used across trips, guides, and guest communications.
        </p>
      </header>

      {isLoading && <p>Loading service settings…</p>}
      {error && (
        <p className="text-sm text-red-600">
          Unable to load service memberships. Please try again.
        </p>
      )}

      {!isLoading && !error && manageableMemberships.length === 0 && (
        <p className="text-sm text-gray-600">
          You do not manage any guide services yet. Owners and office managers can update logos here once they claim a service.
        </p>
      )}

      <div className="space-y-6">
        {manageableMemberships.map((membership) => (
          <div key={membership.id} className="space-y-6">
            <ServiceStripeCard membership={membership} />
            <ServiceBrandingCard membership={membership} />
            <ServiceTemplatesCard membership={membership} />
          </div>
        ))}
      </div>
    </div>
  )
}
