import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi } from 'vitest'

import ServicePricingCard from '../ServicePricingCard'

const {
  listPricingModels,
  createPricingModel,
  updatePricingModel,
  deletePricingModel
} = vi.hoisted(() => ({
  listPricingModels: vi.fn(),
  createPricingModel: vi.fn(),
  updatePricingModel: vi.fn(),
  deletePricingModel: vi.fn()
}))

vi.mock('../api', async (importOriginal) => {
  const mod = await importOriginal()
  return {
    ...mod,
    listPricingModels,
    createPricingModel,
    updatePricingModel,
    deletePricingModel
  }
})

const membership = {
  id: 1,
  guide_service: 42,
  guide_service_name: 'Summit Guides',
  guide_service_logo_url: null,
  role: 'OWNER',
  is_active: true
}

function renderCard(){
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <ServicePricingCard membership={membership} />
    </QueryClientProvider>
  )
}

describe('ServicePricingCard', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    listPricingModels.mockResolvedValue([])
    createPricingModel.mockResolvedValue({
      id: 99,
      service: membership.guide_service,
      name: 'Standard',
      description: '',
      default_location: '',
      currency: 'usd',
      is_deposit_required: false,
      deposit_percent: '0.00',
      tiers: [],
      created_at: '',
      updated_at: ''
    })
    updatePricingModel.mockResolvedValue({
      id: 7,
      service: membership.guide_service,
      name: 'Group Pricing',
      description: '',
      default_location: '',
      currency: 'usd',
      is_deposit_required: true,
      deposit_percent: '15.00',
      tiers: [
        { id: 11, min_guests: 1, max_guests: 4, price_per_guest: '135.00' },
        { id: 12, min_guests: 5, max_guests: null, price_per_guest: '110.00' }
      ],
      created_at: '',
      updated_at: ''
    })
    deletePricingModel.mockResolvedValue(undefined)
  })

  it('renders existing pricing models with tier summaries', async () => {
    listPricingModels.mockResolvedValue([
      {
        id: 5,
        service: membership.guide_service,
        name: 'Standard',
        description: 'Default guide pricing',
        default_location: 'Mount Baker',
        currency: 'usd',
        is_deposit_required: true,
        deposit_percent: '25.00',
        tiers: [
          { id: 1, min_guests: 1, max_guests: 3, price_per_guest: '150.00' },
          { id: 2, min_guests: 4, max_guests: null, price_per_guest: '130.00' }
        ],
        created_at: '',
        updated_at: ''
      }
    ])

    renderCard()

    expect(await screen.findByText(/Standard/)).toBeInTheDocument()
    expect(screen.getByText(/Default guide pricing/)).toBeInTheDocument()
    expect(screen.getByText(/Deposit required: 25% per booking/)).toBeInTheDocument()
    const tierItems = screen.getAllByText(/per guest/)
    expect(tierItems).toHaveLength(2)
    expect(tierItems[0].textContent).toMatch(/\$?\s*150\.00 per guest/)
  })

  it('creates a pricing model from the modal form', async () => {
    renderCard()

    await userEvent.click(screen.getByRole('button', { name: /Add pricing model/i }))
    expect(await screen.findByRole('heading', { name: /Add pricing model/i })).toBeInTheDocument()

    await userEvent.type(screen.getByLabelText(/Name/i), 'Private Trip')
    const priceInput = screen.getByLabelText(/Price per guest/i)
    await userEvent.clear(priceInput)
    await userEvent.type(priceInput, '175')

    await userEvent.click(screen.getByRole('button', { name: /Save pricing model/i }))

    await waitFor(() => {
      expect(createPricingModel).toHaveBeenCalled()
    })
    expect(createPricingModel.mock.calls[0][0]).toEqual({
      service: 42,
      name: 'Private Trip',
      description: '',
      default_location: '',
      currency: 'usd',
      is_deposit_required: false,
      deposit_percent: '0.00',
      tiers: [
        { min_guests: 1, max_guests: null, price_per_guest: '175.00' }
      ]
    })
    expect(screen.getByText(/Pricing model created/i)).toBeInTheDocument()
  })

  it('edits an existing pricing model and submits updated tiers', async () => {
    listPricingModels.mockResolvedValue([
      {
        id: 7,
        service: membership.guide_service,
        name: 'Group Pricing',
        description: '',
        default_location: '',
        currency: 'usd',
        is_deposit_required: false,
        deposit_percent: '0.00',
        tiers: [
          { id: 11, min_guests: 1, max_guests: 4, price_per_guest: '120.00' },
          { id: 12, min_guests: 5, max_guests: null, price_per_guest: '110.00' }
        ],
        created_at: '',
        updated_at: ''
      }
    ])

    renderCard()
    await screen.findByText(/Group Pricing/)

    await userEvent.click(screen.getByRole('button', { name: /Edit/i }))

    const modal = await screen.findByRole('heading', { name: /Edit Group Pricing/ })
    expect(modal).toBeInTheDocument()

    const tierPriceInputs = screen.getAllByLabelText(/Price per guest/i)
    await userEvent.clear(tierPriceInputs[0])
    await userEvent.type(tierPriceInputs[0], '135')

    const depositToggle = screen.getByRole('checkbox', { name: /Deposit required/i })
    await userEvent.click(depositToggle)
    const depositInput = screen.getByLabelText(/Deposit percent/i)
    await userEvent.clear(depositInput)
    await userEvent.type(depositInput, '15')

    await userEvent.click(screen.getByRole('button', { name: /Save pricing model/i }))

    await waitFor(() => {
      expect(updatePricingModel).toHaveBeenCalled()
    })
    expect(updatePricingModel.mock.calls[0][0]).toBe(7)
    expect(updatePricingModel.mock.calls[0][1]).toEqual({
      service: 42,
      name: 'Group Pricing',
      description: '',
      default_location: '',
      currency: 'usd',
      is_deposit_required: true,
      deposit_percent: '15.00',
      tiers: [
        { id: 11, min_guests: 1, max_guests: 4, price_per_guest: '135.00' },
        { id: 12, min_guests: 5, max_guests: null, price_per_guest: '110.00' }
      ]
    })
    expect(screen.getByText(/Pricing model updated/i)).toBeInTheDocument()
  })

  it('deletes a pricing model when confirmed', async () => {
    listPricingModels.mockResolvedValue([
      {
        id: 9,
        service: membership.guide_service,
        name: 'Seasonal',
        description: '',
        default_location: '',
        currency: 'usd',
        is_deposit_required: false,
        deposit_percent: '0.00',
        tiers: [{ id: 21, min_guests: 1, max_guests: null, price_per_guest: '99.00' }],
        created_at: '',
        updated_at: ''
      }
    ])

    vi.spyOn(window, 'confirm').mockReturnValue(true)

    renderCard()
    await screen.findByText(/Seasonal/)

    await userEvent.click(screen.getByRole('button', { name: /Delete/i }))
    await waitFor(() => {
      expect(deletePricingModel).toHaveBeenCalled()
    })
    expect(deletePricingModel.mock.calls[0][0]).toBe(9)
    expect(screen.getByText(/Pricing model deleted/i)).toBeInTheDocument()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })
})
