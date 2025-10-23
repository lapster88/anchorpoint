import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi } from 'vitest'

import ServiceStripeCard from '../ServiceStripeCard'

const { fetchStripeAccountStatus, createStripeOnboardingLink, disconnectStripeAccount } = vi.hoisted(() => ({
  fetchStripeAccountStatus: vi.fn(),
  createStripeOnboardingLink: vi.fn(),
  disconnectStripeAccount: vi.fn(),
}))

vi.mock('../../profile/api', async (importOriginal) => {
  const mod = await importOriginal()
  return {
    ...mod,
    fetchStripeAccountStatus,
    createStripeOnboardingLink,
    disconnectStripeAccount,
  }
})

const membership = {
  id: 1,
  guide_service: 42,
  guide_service_name: 'Summit Guides',
  guide_service_logo_url: null,
  role: 'OWNER',
  is_active: true,
}

function renderCard(){
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <ServiceStripeCard membership={membership} />
    </QueryClientProvider>
  )
}

describe('ServiceStripeCard', () => {
  beforeEach(() => {
    fetchStripeAccountStatus.mockResolvedValue({ connected: false })
    createStripeOnboardingLink.mockResolvedValue({ url: 'https://stripe.test/onboard', expires_at: '2025-01-01T00:00:00Z' })
    disconnectStripeAccount.mockResolvedValue(undefined)
    vi.spyOn(window, 'open').mockImplementation(() => null)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders connect button when not connected', async () => {
    renderCard()

    expect(await screen.findByText(/No Stripe account is connected yet/i)).toBeInTheDocument()
    const button = screen.getByRole('button', { name: /Connect Stripe/i })
    await userEvent.click(button)

    await waitFor(() => {
      expect(createStripeOnboardingLink).toHaveBeenCalledWith(42)
      expect(window.open).toHaveBeenCalledWith('https://stripe.test/onboard', '_blank', 'noopener')
    })
  })

  it('shows status table when connected', async () => {
    fetchStripeAccountStatus.mockResolvedValue({
      connected: true,
      account_id: 'acct_123',
      charges_enabled: true,
      payouts_enabled: false,
      details_submitted: true,
      default_currency: 'usd',
      account_email: 'payouts@example.com',
    })

    renderCard()

    expect(await screen.findByText(/acct_123/)).toBeInTheDocument()
    const enabledBadges = screen.getAllByText(/Enabled/)
    expect(enabledBadges.length).toBeGreaterThan(0)
    expect(screen.getByText(/Disabled/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /Disconnect/i }))
    await waitFor(() => {
      expect(disconnectStripeAccount).toHaveBeenCalledWith(42)
    })
  })
})
