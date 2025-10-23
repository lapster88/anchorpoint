import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi } from 'vitest'

import GuestsDirectoryPage from '../GuestsDirectoryPage'

const { listGuests, requestGuestLink } = vi.hoisted(() => ({
  listGuests: vi.fn(),
  requestGuestLink: vi.fn(),
}))

vi.mock('../api', () => ({
  listGuests,
  requestGuestLink,
}))

function renderPage(){
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <GuestsDirectoryPage />
    </QueryClientProvider>
  )
}

const guestRecord = {
  id: 1,
  email: 'guest@example.com',
  first_name: 'Greta',
  last_name: 'Guest',
  full_name: 'Greta Guest',
  phone: '555-0100',
  updated_at: '2025-01-01T00:00:00Z',
  parties: [
    {
      id: 11,
      trip_title: 'Glacier Intro',
      trip_start: '2025-08-01T08:00:00Z',
      trip_end: '2025-08-02T18:00:00Z',
      party_size: 2,
      payment_status: 'PENDING',
      info_status: 'PENDING',
      waiver_status: 'PENDING',
      last_guest_activity_at: null,
    },
  ],
}

describe('GuestsDirectoryPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders guest cards with trip history', async () => {
    listGuests.mockResolvedValueOnce([guestRecord])

    renderPage()

    expect(await screen.findByText('Greta Guest')).toBeInTheDocument()
    expect(screen.getByText('guest@example.com')).toBeInTheDocument()
    expect(screen.getByText(/Trip history/i)).toBeInTheDocument()
    expect(screen.getByText(/Glacier Intro/)).toBeInTheDocument()
  })

  it('shows empty state when no guests match search', async () => {
    listGuests.mockResolvedValueOnce([])

    renderPage()

    expect(await screen.findByText('No guests found.')).toBeInTheDocument()
  })

  it('displays an error when the API fails', async () => {
    listGuests.mockRejectedValueOnce(new Error('boom'))

    renderPage()

    expect(await screen.findByText(/Unable to load guests/)).toBeInTheDocument()
  })

  it('sends guest link email and trims query input', async () => {
    listGuests.mockResolvedValue([guestRecord])
    requestGuestLink.mockResolvedValue()

    renderPage()

    const searchInput = await screen.findByPlaceholderText(/Search by email or name/)
    await userEvent.type(searchInput, ' greta ')

    await waitFor(() => {
      expect(listGuests).toHaveBeenCalledWith('greta')
    })

    await userEvent.click(await screen.findByRole('button', { name: /Email guest link/ }))

    await waitFor(() => {
      expect(requestGuestLink).toHaveBeenCalledWith({ guest_id: 1 })
    })
  })
})
