import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi } from 'vitest'

import CreatePartyForm from '../CreatePartyForm'

vi.mock('../api', () => ({
  createParty: vi.fn()
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

function renderForm(extraProps: Partial<React.ComponentProps<typeof CreatePartyForm>> = {}){
  return render(
    <QueryClientProvider client={queryClient}>
      <CreatePartyForm trip={trip} onClose={() => {}} {...extraProps} />
    </QueryClientProvider>
  )
}

describe('CreatePartyForm', () => {
  afterEach(() => {
    queryClient.clear()
    vi.clearAllMocks()
  })

  it('requires primary guest email', async () => {
    renderForm()

    await userEvent.click(screen.getByText('Create party'))

    await waitFor(() => {
      expect(screen.getByText('Primary guest email is required.')).toBeInTheDocument()
    })
  })

  it('submits booking and shows links', async () => {
    const { createParty } = await import('../api')
    createParty.mockResolvedValueOnce({
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
    await userEvent.click(screen.getByText('Create party'))

    expect(await screen.findByText(/Party created/)).toBeInTheDocument()
    expect(screen.getByText(/https:\/\/stripe\.test/)).toBeInTheDocument()
    expect(screen.getByText(/https:\/\/app\.test\/guest/)).toBeInTheDocument()
  })

  it('handles API errors', async () => {
    const { createParty } = await import('../api')
    createParty.mockRejectedValueOnce({ response: { data: { detail: 'Trip full' } } })

    renderForm()
    await userEvent.type(screen.getByLabelText(/^Email/), 'guest@example.com')
    await userEvent.click(screen.getByText('Create party'))

    expect(await screen.findByText('Trip full')).toBeInTheDocument()
  })

  it('invokes onCreated callback', async () => {
    const onCreated = vi.fn()
    const { createParty } = await import('../api')
    createParty.mockResolvedValueOnce({
      id: 2,
      trip: 1,
      party_size: 1,
      payment_status: 'PENDING',
      info_status: 'PENDING',
      waiver_status: 'PENDING',
      payment_url: null,
      guest_portal_url: null
    })

    renderForm({ onCreated })
    await userEvent.type(screen.getByLabelText(/^Email/), 'guest@example.com')
    await userEvent.click(screen.getByText('Create party'))

    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ id: 2 }))
    })
  })
})
