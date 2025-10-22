import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TripsList from '../TripsList'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi } from 'vitest'

const { useQueryMock } = vi.hoisted(() => ({
  useQueryMock: vi.fn()
}))

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>('@tanstack/react-query')
  return {
    ...actual,
    useQuery: useQueryMock,
  }
})

vi.mock('../../profile/api', () => ({
  fetchMemberships: vi.fn(),
}))

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({ isAuthenticated: true, user: { email: 'owner@example.com' } }),
}))

vi.mock('../../../lib/api', () => ({
  api: {
    get: vi.fn(),
    defaults: { headers: { common: {} } }
  }
}))

const mockTrips = [
  {
    id: 1,
    title: 'Glacier Intro',
    location: 'Mt. Baker',
    start: '2025-10-20T08:00:00Z',
    end: '2025-10-21T08:00:00Z',
    price_cents: 15000
  },
  {
    id: 2,
    title: 'Desert Towers',
    location: 'Moab',
    start: '2025-11-01T08:00:00Z',
    end: '2025-11-03T08:00:00Z',
    price_cents: 22000
  }
]

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

function renderTripsList(){
  return render(
    <QueryClientProvider client={queryClient}>
      <TripsList />
    </QueryClientProvider>
  )
}

describe('TripsList', () => {
  let membershipData: any[]

  beforeEach(() => {
    membershipData = []
    useQueryMock.mockImplementation((options: any) => {
      const key = options?.queryKey?.[0]
      if (key === 'trips') {
        return { data: mockTrips, isLoading: false, error: null }
      }
      if (key === 'memberships') {
        return { data: membershipData, isLoading: false, error: null }
      }
      return { data: undefined, isLoading: false, error: null }
    })
  })

  afterEach(() => {
    queryClient.clear()
    vi.clearAllMocks()
    useQueryMock.mockReset()
  })

  it('renders trips returned from the API', async () => {
    renderTripsList()

    expect(await screen.findByText('Glacier Intro')).toBeInTheDocument()
    expect(screen.getByText(/Mt. Baker/)).toBeInTheDocument()
    expect(screen.getByText('Desert Towers')).toBeInTheDocument()
  })

  it('shows create booking button for owner/manager', async () => {
    membershipData = [
      { id: 1, guide_service: 1, guide_service_name: 'Summit Guides', role: 'OWNER', is_active: true }
    ]

    renderTripsList()

    const buttons = await screen.findAllByText('Create booking')
    expect(buttons.length).toBeGreaterThan(0)
  })

  it('does not show create booking button for guides', async () => {
    membershipData = [
      { id: 1, guide_service: 1, guide_service_name: 'Summit Guides', role: 'GUIDE', is_active: true }
    ]

    renderTripsList()

    await waitFor(() => {
      expect(screen.queryByText('Create booking')).not.toBeInTheDocument()
    })
  })

  it('opens booking form when clicking create booking', async () => {
    membershipData = [
      { id: 1, guide_service: 1, guide_service_name: 'Summit Guides', role: 'OWNER', is_active: true }
    ]

    renderTripsList()

    const [button] = await screen.findAllByText('Create booking')
    await userEvent.click(button)

    expect(screen.getByText(/Create booking for Glacier Intro/)).toBeInTheDocument()
  })
})
