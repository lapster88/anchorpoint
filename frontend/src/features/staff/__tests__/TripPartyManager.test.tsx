import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi } from 'vitest'

import TripPartyManager from '../TripPartyManager'

const { listTripParties } = vi.hoisted(() => ({
  listTripParties: vi.fn(),
}))

const { getTrip, listServiceGuides, assignGuides } = vi.hoisted(() => ({
  getTrip: vi.fn(),
  listServiceGuides: vi.fn(),
  assignGuides: vi.fn(),
}))

vi.mock('../api', () => ({
  listTripParties,
}))

vi.mock('../../trips/api', () => ({
  getTrip,
  listServiceGuides,
  assignGuides,
}))

const mockCreate = vi.fn()

vi.mock('../CreatePartyForm', () => ({
  __esModule: true,
  default: ({ onCreated }: { onCreated: (party: any) => void }) => (
    <button onClick={() => { mockCreate(); onCreated({ id: 99 }) }}>mock create form</button>
  ),
}))

const trip = {
  id: 1,
  title: 'Glacier Intro',
  location: 'Mt. Baker',
  start: '2025-10-20T08:00:00Z',
  end: '2025-10-20T16:00:00Z',
  price_cents: 15000,
  guide_service: 1,
  guide_service_name: 'Summit Guides',
  assignments: [],
  requires_assignment: true,
  pricing_snapshot: {
    currency: 'usd',
    is_deposit_required: false,
    deposit_percent: '0',
    tiers: [
      { min_guests: 1, max_guests: null, price_per_guest: '150.00', price_per_guest_cents: 15000 },
    ],
  },
}

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

function renderManager(overrides?: Partial<React.ComponentProps<typeof TripPartyManager>>){
  return render(
    <QueryClientProvider client={queryClient}>
      <TripPartyManager
        trip={trip}
        onClose={() => {}}
        canEditAssignments={true}
        serviceId={1}
        {...overrides}
      />
    </QueryClientProvider>
  )
}

describe('TripPartyManager', () => {
  beforeEach(() => {
    const tripDetail = {
      id: trip.id,
      guide_service: 1,
      guide_service_name: 'Summit Guides',
      title: trip.title,
      location: 'Mt. Baker',
      start: trip.start,
      end: trip.end,
      price_cents: trip.price_cents,
      difficulty: null,
      description: '',
      parties: [],
      assignments: [],
      requires_assignment: true,
      pricing_snapshot: trip.pricing_snapshot,
    }

    listTripParties.mockResolvedValue([])
    getTrip.mockResolvedValue(tripDetail)
    listServiceGuides.mockResolvedValue([
      { id: 10, display_name: 'Gabe Guide', first_name: 'Gabe', last_name: 'Guide', email: 'guide@example.com' }
    ])
    assignGuides.mockImplementation(async () => {
      const updated = {
        ...tripDetail,
        assignments: [
          { id: 200, guide_id: 10, guide_name: 'Gabe Guide' }
        ],
        requires_assignment: false,
        pricing_snapshot: trip.pricing_snapshot,
      }
      getTrip.mockResolvedValue(updated)
      return updated
    })
    mockCreate.mockClear()
    queryClient.clear()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('shows party summary with pricing when data exists', async () => {
    listTripParties.mockResolvedValue([
      {
        id: 10,
        trip_id: 1,
        primary_guest_name: 'Greta Guest',
        primary_guest_email: 'guest@example.com',
        party_size: 2,
        payment_status: 'PENDING',
        info_status: 'PENDING',
        waiver_status: 'PENDING',
        created_at: '2025-01-01T00:00:00Z',
        payment_preview_url: 'https://app.test/payments/preview?booking=10',
        guests: [
          { id: 1, full_name: 'Greta Guest', email: 'guest@example.com', is_primary: true },
          { id: 2, full_name: 'Frank Friend', email: 'friend@example.com', is_primary: false },
        ],
        price_per_guest_cents: 15000,
        price_per_guest: '150.00',
        total_amount_cents: 30000,
        total_amount: '300.00',
      },
    ])

    renderManager()

    expect(await screen.findByText(/Manage Glacier Intro/)).toBeInTheDocument()
    expect(await screen.findByText(/\$150\.00 per guest/)).toBeInTheDocument()
    expect(await screen.findByText(/Assigned guides/i)).toBeInTheDocument()
    const guestLabels = await screen.findAllByText(/Greta Guest/)
    expect(guestLabels.length).toBeGreaterThan(0)
    const pricingLine = await screen.findByText(/Price per guest/i)
    expect(pricingLine).toBeInTheDocument()
    const priceValues = await screen.findAllByText(/\$150\.00/)
    expect(priceValues[0]).toBeInTheDocument()
    expect(await screen.findByText(/Total due/i)).toBeInTheDocument()
    expect(await screen.findByText(/payments\/preview/)).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /Add another party/ })).toBeInTheDocument()
  })

  it('shows creation form when no parties exist', async () => {
    listTripParties.mockResolvedValue([])

    renderManager()

    await waitFor(() => {
      expect(screen.getByText(/No parties yet/)).toBeInTheDocument()
    })
    expect(screen.getByText('mock create form')).toBeInTheDocument()
  })

  it('reveals advanced party form on demand', async () => {
    listTripParties.mockResolvedValue([
      {
        id: 10,
        trip_id: 1,
        primary_guest_name: 'Greta Guest',
        primary_guest_email: 'guest@example.com',
        party_size: 2,
        payment_status: 'PENDING',
        info_status: 'PENDING',
        waiver_status: 'PENDING',
        created_at: '2025-01-01T00:00:00Z',
        payment_preview_url: null,
        guests: [],
        price_per_guest_cents: 15000,
        price_per_guest: '150.00',
        total_amount_cents: 30000,
        total_amount: '300.00',
      },
    ])

    renderManager()

    await screen.findByText(/Manage Glacier Intro/)
    expect(screen.queryByText('mock create form')).not.toBeInTheDocument()

    const advancedButton = await screen.findByRole('button', { name: /Add another party/ })
    await userEvent.click(advancedButton)
    expect(await screen.findByText('mock create form')).toBeInTheDocument()

    await userEvent.click(screen.getByText('mock create form'))
    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalled()
    })
  })

  it('allows manager to assign guide and shows save feedback', async () => {
    const onTripUpdate = vi.fn()
    renderManager({ onTripUpdate })

    const checkbox = await screen.findByLabelText('Gabe Guide')
    await userEvent.click(checkbox)

    await waitFor(() => {
      expect(assignGuides).toHaveBeenCalledWith(trip.id, [10])
    })
    await waitFor(() => {
      expect(onTripUpdate).toHaveBeenCalledWith(expect.objectContaining({ requires_assignment: false }))
    })
    expect(await screen.findByText('Saved')).toBeInTheDocument()
    expect((await screen.findByLabelText('Gabe Guide')) as HTMLInputElement).toBeChecked()

    await userEvent.click(await screen.findByRole('button', { name: /Clear all/i }))
    await waitFor(() => {
      expect(assignGuides).toHaveBeenCalledWith(trip.id, [])
    })
    expect((await screen.findByLabelText('Gabe Guide')) as HTMLInputElement).not.toBeChecked()
  })

  it('shows read-only assignment when editing disabled', async () => {
    getTrip.mockResolvedValueOnce({
      ...trip,
      parties: [],
      assignments: [
        { id: 20, guide_id: 10, guide_name: 'Gabe Guide' }
      ],
      requires_assignment: false,
      difficulty: null,
      description: '',
    })

    renderManager({ canEditAssignments: false, serviceId: null })

    expect(await screen.findByText(/Gabe Guide/)).toBeInTheDocument()
    expect(screen.queryByText(/Assigned guides/)).not.toBeInTheDocument()
  })
})
