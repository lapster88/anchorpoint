import React from 'react'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi } from 'vitest'

import ServiceSettingsPage from '../ServiceSettingsPage'
import { MembershipsProvider } from '../../../lib/memberships'

const { fetchMemberships } = vi.hoisted(() => ({
  fetchMemberships: vi.fn(),
}))

vi.mock('../../profile/api', async (importOriginal) => {
  const mod = await importOriginal()
  return {
    ...mod,
    fetchMemberships,
  }
})

vi.mock('../../profile/ServiceBrandingCard', () => ({
  __esModule: true,
  default: ({ membership }: { membership: any }) => <div>Branding {membership.guide_service_name}</div>,
}))

vi.mock('../ServiceStripeCard', () => ({
  __esModule: true,
  default: ({ membership }: { membership: any }) => <div>Stripe {membership.guide_service_name}</div>,
}))

vi.mock('../ServiceTemplatesCard', () => ({
  __esModule: true,
  default: ({ membership }: { membership: any }) => <div>Templates {membership.guide_service_name}</div>,
}))

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({ isAuthenticated: true }),
}))

let queryClient: QueryClient

function renderPage(){
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MembershipsProvider>
        <ServiceSettingsPage />
      </MembershipsProvider>
    </QueryClientProvider>
  )
}

describe('ServiceSettingsPage', () => {
  afterEach(() => {
    if (queryClient) {
      queryClient.clear()
    }
    vi.clearAllMocks()
  })

  it('shows message when user manages no services', async () => {
    fetchMemberships.mockResolvedValue([])

    renderPage()

    expect(await screen.findByText(/You do not manage any guide services yet/i)).toBeInTheDocument()
  })

  it('renders cards for manageable memberships', async () => {
    fetchMemberships.mockResolvedValue([
      { id: 1, guide_service: 1, guide_service_name: 'Summit Guides', guide_service_logo_url: null, role: 'OWNER', is_active: true },
      { id: 2, guide_service: 2, guide_service_name: 'Desert Adventures', guide_service_logo_url: null, role: 'GUIDE', is_active: true },
      { id: 3, guide_service: 3, guide_service_name: 'Alpine Works', guide_service_logo_url: null, role: 'OFFICE_MANAGER', is_active: true },
    ])

    renderPage()

    expect(await screen.findByText(/Stripe Summit Guides/)).toBeInTheDocument()
    expect(screen.getByText(/Branding Summit Guides/)).toBeInTheDocument()
    expect(screen.getByText(/Templates Summit Guides/)).toBeInTheDocument()
    expect(screen.getByText(/Stripe Alpine Works/)).toBeInTheDocument()
    expect(screen.getByText(/Templates Alpine Works/)).toBeInTheDocument()
    expect(screen.queryByText(/Stripe Desert Adventures/)).not.toBeInTheDocument()
  })
})
