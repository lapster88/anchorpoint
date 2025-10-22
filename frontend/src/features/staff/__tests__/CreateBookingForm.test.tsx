import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi } from 'vitest'

import CreateBookingForm from '../CreateBookingForm'

vi.mock('../api', () => ({
  createBooking: vi.fn()
}))

vi.mock('../../../../lib/api', () => ({
  api: {
    defaults: { headers: { common: {} } }
  }
}))

const trip = {
  id: 1,
  title: 'Summit Push',
  start: '2025-10-20T08:00:00Z',
  end: '2025-10-20T16:00:00Z',
  price_cents: 15000
}

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

function renderForm(){
  return render(
    <QueryClientProvider client={queryClient}>
      <CreateBookingForm trip={trip} onClose={() => {}} />
    </QueryClientProvider>
  )
}

describe('CreateBookingForm', () => {
  afterEach(() => {
    queryClient.clear()
    vi.clearAllMocks()
  })

  it('requires primary guest email', async () => {
    renderForm()

    await userEvent.click(screen.getByText('Create booking'))

    await waitFor(() => {
      expect(screen.getByText('Primary guest email is required.')).toBeInTheDocument()
    })
  })

  it('submits booking and shows links', async () => {
    const { createBooking } = await import('../api')
    createBooking.mockResolvedValueOnce({
      id: 1,
      trip: 1,
      party_size: 1,
      payment_status: 'PENDING',
      info_status: 'PENDING',
      waiver_status: 'PENDING',
      payment_url: 'https://stripe.test/pay',
      guest_portal_url: 'https://app.test/guest?token=abc'
    })

    renderForm()
    await userEvent.type(screen.getByLabelText(/^Email/), 'guest@example.com')
    await userEvent.click(screen.getByText('Create booking'))

    expect(await screen.findByText(/Booking created/)).toBeInTheDocument()
    expect(screen.getByText(/https:\/\/stripe\.test/)).toBeInTheDocument()
    expect(screen.getByText(/https:\/\/app\.test\/guest/)).toBeInTheDocument()
  })

  it('handles API errors', async () => {
    const { createBooking } = await import('../api')
    createBooking.mockRejectedValueOnce({ response: { data: { detail: 'Trip full' } } })

    renderForm()
    await userEvent.type(screen.getByLabelText(/^Email/), 'guest@example.com')
    await userEvent.click(screen.getByText('Create booking'))

    expect(await screen.findByText('Trip full')).toBeInTheDocument()
  })
})
