import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi } from 'vitest'

import CreateTripForm from '../CreateTripForm'

const { createTrip, listServiceGuides } = vi.hoisted(() => ({
  createTrip: vi.fn(),
  listServiceGuides: vi.fn(),
}))

vi.mock('../api', () => ({
  createTrip,
  listServiceGuides,
}))

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

function renderForm(props: Partial<React.ComponentProps<typeof CreateTripForm>> = {}){
  return render(
    <QueryClientProvider client={queryClient}>
      <CreateTripForm
        serviceId={1}
        onClose={() => {}}
        onCreated={() => {}}
        {...props}
      />
    </QueryClientProvider>
  )
}

describe('CreateTripForm', () => {
  beforeEach(() => {
    queryClient.clear()
    listServiceGuides.mockResolvedValue([])
    createTrip.mockResolvedValue({
      id: 99,
      guide_service: 1,
      guide_service_name: 'Summit Guides',
      title: 'Mock Trip',
      location: 'Mock Location',
      start: '2025-10-20T08:00:00Z',
      end: '2025-10-20T16:00:00Z',
      capacity: 6,
      price_cents: 15000,
      difficulty: null,
      description: '',
      parties: [],
      assignments: [],
      requires_assignment: true,
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('shows guidance when no service is selected', () => {
    renderForm({ serviceId: null })

    expect(screen.getByText(/You don't have an active guide service selected/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Create trip' })).not.toBeInTheDocument()
  })

  it('validates required trip fields before submitting', async () => {
    renderForm()

    await waitFor(() => expect(listServiceGuides).toHaveBeenCalledWith(1))

    await userEvent.type(screen.getByLabelText('Location'), 'Mt. Baker')
    await userEvent.type(screen.getByLabelText('Start'), '2025-10-20T08:00')
    await userEvent.type(screen.getByLabelText('End'), '2025-10-20T16:00')
    await userEvent.type(screen.getByLabelText('Price (USD)'), '0')
    await userEvent.type(screen.getByLabelText(/^Email/), 'guest@example.com')

    await userEvent.click(screen.getByRole('button', { name: 'Create trip' }))

    expect(await screen.findByText('Price must be greater than zero.')).toBeInTheDocument()
    expect(createTrip).not.toHaveBeenCalled()
  })

  it('submits trip payload with computed defaults and party data', async () => {
    const onCreated = vi.fn()
    listServiceGuides.mockResolvedValue([
      { id: 10, display_name: 'Gabe Guide', first_name: 'Gabe', last_name: 'Guide', email: 'guide@example.com' }
    ])

    renderForm({ onCreated })

    await waitFor(() => expect(listServiceGuides).toHaveBeenCalledWith(1))

    const guideCheckbox = await screen.findByLabelText('Gabe Guide')
    await userEvent.click(guideCheckbox)
    await userEvent.type(screen.getByLabelText('Location'), 'Mt. Baker')
    await userEvent.type(screen.getByLabelText('Start'), '2025-10-20T08:00')
    await userEvent.type(screen.getByLabelText('End'), '2025-10-20T16:00')
    await userEvent.type(screen.getByLabelText('Price (USD)'), '150')
    await userEvent.type(screen.getByLabelText(/^Email/), 'guest@example.com')
    await userEvent.type(screen.getByLabelText('First name'), 'Greta')
    await userEvent.type(screen.getByLabelText('Last name'), 'Guest')

    await userEvent.click(screen.getByRole('button', { name: 'Add guest' }))
    const additionalEmail = screen.getAllByLabelText(/^Email/)[1]
    await userEvent.type(additionalEmail, 'friend@example.com')
    await userEvent.type(screen.getByLabelText('Party size'), '4')

    await userEvent.click(screen.getByRole('button', { name: 'Create trip' }))

    await waitFor(() => expect(createTrip).toHaveBeenCalledTimes(1))
    const payload = createTrip.mock.calls[0][0]

    expect(payload.title).toBe('Greta Guest')
    expect(payload.guide_service).toBe(1)
    expect(payload.guides).toEqual([10])
    expect(payload.location).toBe('Mt. Baker')
    expect(payload.price_cents).toBe(15000)
    expect(payload.party.primary_guest.email).toBe('guest@example.com')
    expect(payload.party.additional_guests?.[0].email).toBe('friend@example.com')
    expect(payload.party.party_size).toBe(4)

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ id: 99 })))
  })
})
