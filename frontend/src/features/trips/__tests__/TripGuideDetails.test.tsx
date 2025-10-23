import React from 'react'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi } from 'vitest'

import TripGuideDetails from '../TripGuideDetails'

const { getTrip } = vi.hoisted(() => ({
  getTrip: vi.fn(),
}))

vi.mock('../api', () => ({
  getTrip,
}))

const trip = {
  id: 42,
  title: 'Summit Push',
  location: 'Rainier',
  start: '2025-10-20T08:00:00Z',
  end: '2025-10-21T16:00:00Z',
  price_cents: 18000,
  guide_service: 1,
  guide_service_name: 'Summit Guides',
  assignments: [],
  requires_assignment: false,
}

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

function renderDetails(){
  return render(
    <QueryClientProvider client={queryClient}>
      <TripGuideDetails trip={trip} onClose={() => {}} />
    </QueryClientProvider>
  )
}

describe('TripGuideDetails', () => {
  beforeEach(() => {
    getTrip.mockResolvedValue({
      ...trip,
      difficulty: null,
      description: '',
      parties: [
        {
          id: 1,
          trip_id: trip.id,
          primary_guest_name: 'Greta Guest',
          primary_guest_email: 'guest@example.com',
          party_size: 2,
          payment_status: 'PENDING',
          info_status: 'PENDING',
          waiver_status: 'PENDING',
          created_at: '2025-01-01T00:00:00Z',
          payment_preview_url: null,
          guests: [
            { id: 1, full_name: 'Greta Guest', email: 'guest@example.com', is_primary: true },
            { id: 2, full_name: 'Frank Friend', email: 'friend@example.com', is_primary: false },
          ],
        }
      ],
      assignments: [
        { id: 10, guide_id: 99, guide_name: 'Gabe Guide' }
      ],
      requires_assignment: false,
    })
    queryClient.clear()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders trip details for guides', async () => {
    renderDetails()

    expect(await screen.findByText(/Summit Push/)).toBeInTheDocument()
    expect(await screen.findByText(/Total guests: 2/)).toBeInTheDocument()
    expect(screen.getByText(/Gabe Guide/)).toBeInTheDocument()
    expect(screen.getByText(/Greta Guest/)).toBeInTheDocument()
  })
})
