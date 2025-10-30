import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi } from 'vitest'
import TripsList from '../TripsList'
import { MembershipsProvider } from '../../../lib/memberships'

vi.mock('../../profile/api', () => ({
  fetchMemberships: vi.fn(),
}))

vi.mock('../TripGuideDetails', () => ({
  __esModule: true,
  default: ({ trip }: { trip: any }) => <div>Guide trip {trip.title}</div>,
}))

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({ isAuthenticated: true, user: { email: 'owner@example.com' } }),
}))

vi.mock('../../../lib/api', () => {
  const get = vi.fn()
  return {
    api: {
      get,
      post: vi.fn(),
      defaults: { headers: { common: {} } }
    }
  }
})

import { api } from '../../../lib/api'
import { fetchMemberships } from '../../profile/api'

const mockTrips = [
  {
    id: 1,
    title: 'Glacier Intro',
    location: 'Mt. Baker',
    start: '2025-10-20T08:00:00Z',
    end: '2025-10-21T08:00:00Z',
    price_cents: 15000,
    guide_service: 1,
    guide_service_name: 'Summit Guides',
    assignments: [],
    requires_assignment: true
  },
  {
    id: 2,
    title: 'Desert Towers',
    location: 'Moab',
    start: '2025-11-01T08:00:00Z',
    end: '2025-11-03T08:00:00Z',
    price_cents: 22000,
    guide_service: 2,
    guide_service_name: 'Desert Adventures',
    assignments: [
      { id: 3, guide_id: 9, guide_name: 'Guide Example' }
    ],
    requires_assignment: false
  }
]

const mockTripDetail = {
  id: 1,
  guide_service: 1,
  guide_service_name: 'Summit Guides',
  title: 'Glacier Intro',
  location: 'Mt. Baker',
  start: '2025-10-20T08:00:00Z',
  end: '2025-10-21T08:00:00Z',
  price_cents: 15000,
  difficulty: null,
  description: '',
  parties: [],
  assignments: [],
  requires_assignment: true,
}

let queryClient: QueryClient

function renderTripsList(){
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MembershipsProvider>
        <TripsList />
      </MembershipsProvider>
    </QueryClientProvider>
  )
}

describe('TripsList', () => {
  let membershipData: any[]

  beforeEach(() => {
    membershipData = []
    fetchMemberships.mockImplementation(async () => membershipData)
    api.get.mockImplementation(async (path: string) => {
      if (path === '/api/trips/') {
        return { data: { results: mockTrips } }
      }
      if (path === `/api/trips/${mockTripDetail.id}/`) {
        return { data: mockTripDetail }
      }
      if (path === `/api/trips/${mockTripDetail.id}/parties/`) {
        return { data: { parties: [] } }
      }
      if (path === `/api/trips/service/${mockTripDetail.guide_service}/guides/`) {
        return { data: [] }
      }
      return { data: [] }
    })
  })

  afterEach(() => {
    if (queryClient) {
      queryClient.clear()
    }
    vi.clearAllMocks()
  })

  it('renders trips returned from the API', async () => {
    renderTripsList()

    expect(await screen.findByText('Glacier Intro')).toBeInTheDocument()
    expect(screen.getByText(/Mt. Baker/)).toBeInTheDocument()
    expect(screen.getByText('Desert Towers')).toBeInTheDocument()
  })

  it('shows manage trip button for owner/manager', async () => {
    membershipData = [
      { id: 1, guide_service: 1, guide_service_name: 'Summit Guides', guide_service_logo_url: null, role: 'OWNER', is_active: true }
    ]

    renderTripsList()

    const buttons = await screen.findAllByText('Manage trip')
    expect(buttons.length).toBeGreaterThan(0)
    const createButton = screen.getByRole('button', { name: 'Create trip' })
    expect(createButton).toBeInTheDocument()
    expect(createButton).toBeEnabled()
  })

  it('does not show manage trip button for guides', async () => {
    membershipData = [
      { id: 1, guide_service: 1, guide_service_name: 'Summit Guides', guide_service_logo_url: null, role: 'GUIDE', is_active: true }
    ]

    renderTripsList()

    await waitFor(() => {
      expect(screen.queryByText('Manage trip')).not.toBeInTheDocument()
    })
  })

  it('opens trip manager when clicking manage trip', async () => {
    membershipData = [
      { id: 1, guide_service: 1, guide_service_name: 'Summit Guides', guide_service_logo_url: null, role: 'OWNER', is_active: true }
    ]

    renderTripsList()

    const [button] = await screen.findAllByText('Manage trip')
    await userEvent.click(button)

    expect(await screen.findByText(/Manage Glacier Intro/)).toBeInTheDocument()
  })

  it('shows service label for guides with multiple services', async () => {
    membershipData = [
      { id: 1, guide_service: 1, guide_service_name: 'Summit Guides', guide_service_logo_url: null, role: 'GUIDE', is_active: true },
      { id: 2, guide_service: 2, guide_service_name: 'Desert Adventures', guide_service_logo_url: null, role: 'GUIDE', is_active: true }
    ]

    renderTripsList()

    await screen.findByText('Glacier Intro')
    expect(screen.getByText('Summit Guides')).toBeInTheDocument()
    expect(screen.getByText('Desert Adventures')).toBeInTheDocument()
  })

  it('displays assignment badge when a trip needs a guide', async () => {
    membershipData = [
      { id: 1, guide_service: 1, guide_service_name: 'Summit Guides', guide_service_logo_url: null, role: 'OWNER', is_active: true }
    ]

    renderTripsList()

    expect(await screen.findByText('Needs guide assignment')).toBeInTheDocument()
  })

  it('allows guides to open a read-only detail view', async () => {
    membershipData = [
      { id: 1, guide_service: 1, guide_service_name: 'Summit Guides', guide_service_logo_url: null, role: 'GUIDE', is_active: true }
    ]

    renderTripsList()

    const viewButtons = await screen.findAllByText('View details')
    await userEvent.click(viewButtons[0])

    expect(await screen.findByText(/Guide trip Glacier Intro/)).toBeInTheDocument()
  })
})
