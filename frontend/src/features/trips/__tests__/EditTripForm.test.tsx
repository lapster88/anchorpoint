import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi } from 'vitest'

import EditTripForm from '../EditTripForm'

const { updateTrip } = vi.hoisted(() => ({
  updateTrip: vi.fn(),
}))

vi.mock('../api', () => ({
  updateTrip,
}))

const singleDayTrip = {
  id: 1,
  guide_service: 7,
  guide_service_name: 'Summit Guides',
  title: 'Intro to Ice',
  location: 'Mount Baker',
  start: '2025-10-20T08:00:00Z',
  end: '2025-10-20T16:00:00Z',
  price_cents: 15000,
  difficulty: null,
  description: '',
  duration_hours: 8,
  duration_days: null,
  timing_mode: 'single_day' as const,
  target_clients_per_guide: 3,
  notes: '',
  parties: [],
  assignments: [],
  requires_assignment: false,
  pricing_snapshot: {
    currency: 'usd',
    is_deposit_required: false,
    deposit_percent: '0',
    tiers: [{ min_guests: 1, max_guests: null, price_per_guest: '150.00', price_per_guest_cents: 15000 }],
  },
  template_id: null,
  template_snapshot: null,
}

const multiDayTrip = {
  ...singleDayTrip,
  id: 2,
  title: 'Glacier Expedition',
  start: '2025-11-05T07:00:00Z',
  end: '2025-11-08T07:00:00Z',
  duration_hours: null,
  duration_days: 3,
  timing_mode: 'multi_day' as const,
  target_clients_per_guide: 2,
  price_cents: 25000,
  pricing_snapshot: {
    currency: 'usd',
    is_deposit_required: true,
    deposit_percent: '25.00',
    tiers: [
      { min_guests: 1, max_guests: 4, price_per_guest: '250.00', price_per_guest_cents: 25000 },
      { min_guests: 5, max_guests: null, price_per_guest: '230.00', price_per_guest_cents: 23000 },
    ],
  },
  template_id: 12,
}

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

function renderForm(trip = singleDayTrip, overrides: Partial<React.ComponentProps<typeof EditTripForm>> = {}){
  return render(
    <QueryClientProvider client={queryClient}>
      <EditTripForm trip={trip} onClose={() => {}} onSaved={() => {}} {...overrides} />
    </QueryClientProvider>
  )
}

describe('EditTripForm', () => {
  beforeEach(() => {
    queryClient.clear()
    vi.clearAllMocks()
  })

  it('submits updated single-day trip details with pricing and ratio', async () => {
    const onSaved = vi.fn()
    const updatedTrip = { ...singleDayTrip, title: 'Updated Trip', price_cents: 17550 }
    updateTrip.mockResolvedValueOnce(updatedTrip)

    renderForm(singleDayTrip, { onSaved })

    await userEvent.clear(screen.getByLabelText('Trip title'))
    await userEvent.type(screen.getByLabelText('Trip title'), 'Updated Trip')
    await userEvent.clear(screen.getByLabelText('Location'))
    await userEvent.type(screen.getByLabelText('Location'), 'Updated Location')
    await userEvent.clear(screen.getByLabelText('Trip date'))
    await userEvent.type(screen.getByLabelText('Trip date'), '2025-10-25')
    await userEvent.clear(screen.getByLabelText('Start time'))
    await userEvent.type(screen.getByLabelText('Start time'), '09:30')
    await userEvent.clear(screen.getByLabelText('Duration (hours)'))
    await userEvent.type(screen.getByLabelText('Duration (hours)'), '9')
    await userEvent.clear(screen.getByLabelText('Price (USD)'))
    await userEvent.type(screen.getByLabelText('Price (USD)'), '175.5')
    await userEvent.clear(screen.getByLabelText('Target guests per guide (optional)'))
    await userEvent.type(screen.getByLabelText('Target guests per guide (optional)'), '4')
    await userEvent.clear(screen.getByLabelText('Description'))
    await userEvent.type(screen.getByLabelText('Description'), 'Updated description')
    await userEvent.clear(screen.getByLabelText('Notes for guides (optional)'))
    await userEvent.type(screen.getByLabelText('Notes for guides (optional)'), 'Bring extra screws')

    await userEvent.click(screen.getByRole('button', { name: /Save changes/i }))

    await waitFor(() => {
      expect(updateTrip).toHaveBeenCalledTimes(1)
    })

    const [tripId, payload] = updateTrip.mock.calls[0]
    expect(tripId).toBe(singleDayTrip.id)
    expect(payload.timing_mode).toBe('single_day')
    expect(payload.duration_hours).toBe(9)
    expect(payload.duration_days).toBeUndefined()
    expect(payload.price_cents).toBe(17550)
    expect(payload.location).toBe('Updated Location')
    expect(payload.description).toBe('Updated description')
    expect(payload.notes).toBe('Bring extra screws')
    expect(payload.target_clients_per_guide).toBe(4)
    expect(payload.start).toContain('2025-10-25T09:30')

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledWith(updatedTrip)
    })
  })

  it('submits multi-day trip updates without overriding template pricing', async () => {
    const onSaved = vi.fn()
    const updatedTrip = { ...multiDayTrip, duration_days: 4, end: '2025-11-09T07:00:00Z' }
    updateTrip.mockResolvedValueOnce(updatedTrip)

    renderForm(multiDayTrip, { onSaved })

    const priceInput = screen.getByLabelText(/Price \(USD\)/i) as HTMLInputElement
    expect(priceInput).toBeDisabled()

    await userEvent.clear(screen.getByLabelText('Start'))
    await userEvent.type(screen.getByLabelText('Start'), '2025-11-10T07:00')
    await userEvent.clear(screen.getByLabelText('Duration (days)'))
    await userEvent.type(screen.getByLabelText('Duration (days)'), '4')
    await userEvent.clear(screen.getByLabelText('Target guests per guide (optional)'))
    await userEvent.clear(screen.getByLabelText('Description'))
    await userEvent.type(screen.getByLabelText('Description'), 'Multi-day update')
    await userEvent.clear(screen.getByLabelText('Notes for guides (optional)'))
    await userEvent.type(screen.getByLabelText('Notes for guides (optional)'), 'Updated notes')

    await userEvent.click(screen.getByRole('button', { name: /Save changes/i }))

    await waitFor(() => expect(updateTrip).toHaveBeenCalledTimes(1))

    const [, payload] = updateTrip.mock.calls[0]
    expect(payload.timing_mode).toBe('multi_day')
    expect(payload.duration_days).toBe(4)
    expect(payload.duration_hours).toBeUndefined()
    expect(payload).not.toHaveProperty('price_cents')
    expect(payload.target_clients_per_guide).toBeNull()
    expect(payload.description).toBe('Multi-day update')
    expect(payload.notes).toBe('Updated notes')
    expect(payload.start).toContain('2025-11-10T07:00')

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledWith(updatedTrip)
    })
  })
})
