import React from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi } from 'vitest'

import ServiceTemplatesCard from '../ServiceTemplatesCard'

const {
  listTripTemplates,
  createTripTemplate,
  updateTripTemplate,
  deleteTripTemplate,
  duplicateTripTemplate
} = vi.hoisted(() => ({
  listTripTemplates: vi.fn(),
  createTripTemplate: vi.fn(),
  updateTripTemplate: vi.fn(),
  deleteTripTemplate: vi.fn(),
  duplicateTripTemplate: vi.fn()
}))

vi.mock('../api', async (importOriginal) => {
  const mod = await importOriginal()
  return {
    ...mod,
    listTripTemplates,
    createTripTemplate,
    updateTripTemplate,
    deleteTripTemplate,
    duplicateTripTemplate
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

const baseTemplate = {
  id: 10,
  service: membership.guide_service,
  title: 'Glacier Skills',
  duration_hours: 8,
  location: 'Mount Baker',
  pricing_currency: 'usd',
  is_deposit_required: false,
  deposit_percent: '0',
  pricing_tiers: [
    { min_guests: 1, max_guests: 2, price_per_guest: '150.00' },
    { min_guests: 3, max_guests: null, price_per_guest: '130.00' }
  ],
  target_client_count: 6,
  target_guide_count: 2,
  notes: 'Bring crampons',
  is_active: true,
  created_at: '',
  updated_at: ''
}

function renderCard(){
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <ServiceTemplatesCard membership={membership} />
    </QueryClientProvider>
  )
}

describe('ServiceTemplatesCard', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    listTripTemplates.mockResolvedValue([])
    createTripTemplate.mockResolvedValue(undefined)
    updateTripTemplate.mockResolvedValue(undefined)
    deleteTripTemplate.mockResolvedValue(undefined)
    duplicateTripTemplate.mockResolvedValue({
      ...baseTemplate,
      id: 99,
      title: 'Glacier Skills (Copy)',
      is_active: false
    })
  })

  it('renders templates with pricing metadata', async () => {
    listTripTemplates.mockResolvedValue([
      baseTemplate,
      { ...baseTemplate, id: 11, title: 'Alpine Traverse', is_active: false }
    ])

    renderCard()

    expect(await screen.findByText(/Glacier Skills/)).toBeInTheDocument()
    const cards = screen.getAllByRole('listitem')
    const firstCard = cards[0]
    expect(within(firstCard).getByText(/Duration: 8h/)).toBeInTheDocument()
    expect(screen.getAllByText(/\$150\.00/)[0]).toBeInTheDocument()
    expect(screen.getByText(/Inactive/)).toBeInTheDocument()
  })

  it('creates a template from the modal form', async () => {
    renderCard()

    await userEvent.click(screen.getByRole('button', { name: /New template/i }))
    expect(await screen.findByRole('heading', { name: /New template/i })).toBeInTheDocument()

    await userEvent.type(screen.getByLabelText(/Title/i), 'Private Ice')
    await userEvent.type(screen.getByLabelText(/^Location/i), 'Coleman Icefall')
    await userEvent.type(screen.getByLabelText(/Duration \(hours\)/i), '9')
    await userEvent.type(screen.getByLabelText(/Clients per trip/i), '5')
    await userEvent.type(screen.getByLabelText(/Guides per trip/i), '2')
    await userEvent.type(screen.getByLabelText(/Price per guest/i), '175')
    await userEvent.type(screen.getByLabelText(/Notes \(optional\)/i), 'Ice screws required')

    await userEvent.click(screen.getByRole('button', { name: /Save template/i }))

    await waitFor(() => expect(createTripTemplate).toHaveBeenCalled())
    expect(createTripTemplate.mock.calls[0][0]).toEqual({
      service: 42,
      title: 'Private Ice',
      duration_hours: 9,
      location: 'Coleman Icefall',
      pricing_currency: 'usd',
      is_deposit_required: false,
      deposit_percent: '0',
      pricing_tiers: [
        { min_guests: 1, max_guests: null, price_per_guest: '175' }
      ],
      target_client_count: 5,
      target_guide_count: 2,
      notes: 'Ice screws required',
      is_active: true
    })
    expect(screen.getByText(/Template created/i)).toBeInTheDocument()
  })

  it('edits an existing template', async () => {
    listTripTemplates.mockResolvedValue([baseTemplate])

    renderCard()
    await screen.findByText(/Glacier Skills/)

    await userEvent.click(screen.getByRole('button', { name: /Edit/i }))

    const notesArea = await screen.findByLabelText(/Notes \(optional\)/i)
    await userEvent.clear(notesArea)
    await userEvent.type(notesArea, 'Updated notes')
    const priceField = screen.getAllByLabelText(/Price per guest/i)[0]
    await userEvent.clear(priceField)
    await userEvent.type(priceField, '155')
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
      pricing_currency: 'usd',
      is_deposit_required: false,
      deposit_percent: '0',
      pricing_tiers: [
        { min_guests: 1, max_guests: 2, price_per_guest: '155' },
        { min_guests: 3, max_guests: null, price_per_guest: '130.00' }
      ],
      target_client_count: 6,
      target_guide_count: 2,
      notes: 'Updated notes',
      is_active: false
    })
    expect(screen.getByText(/Template updated/i)).toBeInTheDocument()
  })

  it('duplicates a template', async () => {
    listTripTemplates.mockResolvedValue([baseTemplate])

    renderCard()
    await screen.findByText(/Glacier Skills/)

    await userEvent.click(screen.getByRole('button', { name: /Duplicate/i }))

    await waitFor(() => expect(duplicateTripTemplate).toHaveBeenCalledTimes(1))
    expect(duplicateTripTemplate).toHaveBeenLastCalledWith(baseTemplate.id, expect.anything())
    expect(screen.getByText(/Template duplicated/i)).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: /Edit Glacier Skills \(Copy/ })).toBeInTheDocument()
  })

  it('deletes a template with confirmation', async () => {
    listTripTemplates.mockResolvedValue([baseTemplate])
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)

    renderCard()
    await screen.findByText(/Glacier Skills/)

    await userEvent.click(screen.getByRole('button', { name: /Delete/i }))

    await waitFor(() => expect(deleteTripTemplate).toHaveBeenCalledTimes(1))
    expect(deleteTripTemplate).toHaveBeenLastCalledWith(baseTemplate.id, expect.anything())
    expect(screen.getByText(/Template deleted/i)).toBeInTheDocument()
    confirmSpy.mockRestore()
  })
})
