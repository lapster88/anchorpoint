import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi } from 'vitest'

import ServiceTemplatesCard from '../ServiceTemplatesCard'

const {
  listTripTemplates,
  listPricingModels,
  createTripTemplate,
  updateTripTemplate,
  deleteTripTemplate
} = vi.hoisted(() => ({
  listTripTemplates: vi.fn(),
  listPricingModels: vi.fn(),
  createTripTemplate: vi.fn(),
  updateTripTemplate: vi.fn(),
  deleteTripTemplate: vi.fn()
}))

vi.mock('../api', async (importOriginal) => {
  const mod = await importOriginal()
  return {
    ...mod,
    listTripTemplates,
    listPricingModels,
    createTripTemplate,
    updateTripTemplate,
    deleteTripTemplate
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
      <ServiceTemplatesCard membership={membership} />
    </QueryClientProvider>
  )
}

describe('ServiceTemplatesCard', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    listPricingModels.mockResolvedValue([
      {
        id: 7,
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
      }
    ])
    listTripTemplates.mockResolvedValue([])
    createTripTemplate.mockResolvedValue(undefined)
    updateTripTemplate.mockResolvedValue(undefined)
    deleteTripTemplate.mockResolvedValue(undefined)
  })

  it('renders templates with metadata', async () => {
    listTripTemplates.mockResolvedValue([
      {
        id: 10,
        service: membership.guide_service,
        title: 'Glacier Skills',
        duration_hours: 8,
        location: 'Mount Baker',
        pricing_model: 7,
        pricing_model_name: 'Standard',
        target_client_count: 6,
        target_guide_count: 2,
        notes: 'Bring crampons',
        is_active: true,
        created_at: '',
        updated_at: ''
      },
      {
        id: 11,
        service: membership.guide_service,
        title: 'Alpine Traverse',
        duration_hours: 12,
        location: 'North Cascades',
        pricing_model: 7,
        pricing_model_name: 'Standard',
        target_client_count: 4,
        target_guide_count: 1,
        notes: '',
        is_active: false,
        created_at: '',
        updated_at: ''
      }
    ])

    renderCard()

    expect(await screen.findByText(/Glacier Skills/)).toBeInTheDocument()
    expect(screen.getByText(/Duration: 8h/)).toBeInTheDocument()
    expect(screen.getAllByText(/Pricing model: Standard/)).toHaveLength(2)
    expect(screen.getByText(/Inactive/)).toBeInTheDocument()
  })

  it('creates a template from the modal form', async () => {
    renderCard()

    await userEvent.click(screen.getByRole('button', { name: /New template/i }))
    expect(await screen.findByRole('heading', { name: /New template/i })).toBeInTheDocument()

    await userEvent.clear(screen.getByLabelText(/Title/i))
    await userEvent.type(screen.getByLabelText(/Title/i), 'Private Ice')
    await userEvent.clear(screen.getByLabelText(/^Location/i))
    await userEvent.type(screen.getByLabelText(/^Location/i), 'Coleman Icefall')
    await userEvent.clear(screen.getByLabelText(/Duration \(hours\)/i))
    await userEvent.type(screen.getByLabelText(/Duration \(hours\)/i), '9')
    await userEvent.clear(screen.getByLabelText(/Clients per trip/i))
    await userEvent.type(screen.getByLabelText(/Clients per trip/i), '5')
    await userEvent.clear(screen.getByLabelText(/Guides per trip/i))
    await userEvent.type(screen.getByLabelText(/Guides per trip/i), '2')
    await userEvent.type(screen.getByLabelText(/Notes \(optional\)/i), 'Ice screws required')

    await userEvent.click(screen.getByRole('button', { name: /Save template/i }))

    await waitFor(() => {
      expect(createTripTemplate).toHaveBeenCalled()
    })
    expect(createTripTemplate.mock.calls[0][0]).toEqual({
      service: 42,
      title: 'Private Ice',
      duration_hours: 9,
      location: 'Coleman Icefall',
      pricing_model: 7,
      target_client_count: 5,
      target_guide_count: 2,
      notes: 'Ice screws required',
      is_active: true
    })
    expect(screen.getByText(/Template created/i)).toBeInTheDocument()
  })

  it('edits an existing template', async () => {
    listTripTemplates.mockResolvedValue([
      {
        id: 10,
        service: membership.guide_service,
        title: 'Glacier Skills',
        duration_hours: 8,
        location: 'Mount Baker',
        pricing_model: 7,
        pricing_model_name: 'Standard',
        target_client_count: 6,
        target_guide_count: 2,
        notes: 'Bring crampons',
        is_active: true,
        created_at: '',
        updated_at: ''
      }
    ])

    renderCard()
    await screen.findByText(/Glacier Skills/)

    await userEvent.click(screen.getByRole('button', { name: /Edit/i }))

    const notesArea = await screen.findByLabelText(/Notes \(optional\)/i)
    await userEvent.clear(notesArea)
    await userEvent.type(notesArea, 'Updated notes')
    const activeToggle = screen.getByLabelText(/Active template/i)
    await userEvent.click(activeToggle)

    await userEvent.click(screen.getByRole('button', { name: /Save template/i }))

    await waitFor(() => expect(updateTripTemplate).toHaveBeenCalled())
    expect(updateTripTemplate.mock.calls[0][0]).toEqual(10)
    expect(updateTripTemplate.mock.calls[0][1]).toEqual({
      service: 42,
      title: 'Glacier Skills',
      duration_hours: 8,
      location: 'Mount Baker',
      pricing_model: 7,
      target_client_count: 6,
      target_guide_count: 2,
      notes: 'Updated notes',
      is_active: false
    })
    expect(screen.getByText(/Template updated/i)).toBeInTheDocument()
  })

  it('deletes a template with confirmation', async () => {
    listTripTemplates.mockResolvedValue([
      {
        id: 10,
        service: membership.guide_service,
        title: 'Glacier Skills',
        duration_hours: 8,
        location: 'Mount Baker',
        pricing_model: 7,
        pricing_model_name: 'Standard',
        target_client_count: 6,
        target_guide_count: 2,
        notes: '',
        is_active: true,
        created_at: '',
        updated_at: ''
      }
    ])
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)

    renderCard()
    await screen.findByText(/Glacier Skills/)

    await userEvent.click(screen.getByRole('button', { name: /Delete/i }))

    await waitFor(() => expect(deleteTripTemplate).toHaveBeenCalled())
    expect(deleteTripTemplate.mock.calls[0][0]).toBe(10)
    expect(screen.getByText(/Template deleted/i)).toBeInTheDocument()
    confirmSpy.mockRestore()
  })
})
