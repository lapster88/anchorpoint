import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi } from 'vitest'

import ServiceBrandingCard from '../ServiceBrandingCard'

const {
  getGuideServiceSettings,
  uploadGuideServiceLogo,
  deleteGuideServiceLogo,
} = vi.hoisted(() => ({
  getGuideServiceSettings: vi.fn(),
  uploadGuideServiceLogo: vi.fn(),
  deleteGuideServiceLogo: vi.fn(),
}))

vi.mock('../api', async (importOriginal) => {
  const mod = await importOriginal()
  return {
    ...mod,
    getGuideServiceSettings,
    uploadGuideServiceLogo,
    deleteGuideServiceLogo,
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
      <ServiceBrandingCard membership={membership} />
    </QueryClientProvider>
  )
}

describe('ServiceBrandingCard', () => {
  beforeEach(() => {
    getGuideServiceSettings.mockResolvedValue({
      id: membership.guide_service,
      name: membership.guide_service_name,
      slug: 'summit-guides',
      contact_email: 'hello@summit.test',
      phone: '555-0100',
      logo_url: null,
    })
    uploadGuideServiceLogo.mockResolvedValue({
      id: membership.guide_service,
      name: membership.guide_service_name,
      slug: 'summit-guides',
      contact_email: 'hello@summit.test',
      phone: '555-0100',
      logo_url: 'https://cdn.test/logo.png',
    })
    deleteGuideServiceLogo.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('uploads a valid logo file', async () => {
    renderCard()

    const fileInput = await screen.findByLabelText('Upload new logo')
    const file = new File(['binary'], 'logo.png', { type: 'image/png' })
    await userEvent.upload(fileInput, file)

    await waitFor(() => {
      expect(uploadGuideServiceLogo).toHaveBeenCalledWith(membership.guide_service, file)
    })
    expect(await screen.findByText(/Logo updated/i)).toBeInTheDocument()
    expect(window.getComputedStyle(screen.getByRole('button', { name: /Remove logo/i })).opacity).not.toBe('0.5')
  })

  it('rejects oversized files', async () => {
    renderCard()

    const fileInput = await screen.findByLabelText('Upload new logo')
    const file = new File([new ArrayBuffer(3 * 1024 * 1024)], 'large.png', { type: 'image/png' })
    await userEvent.upload(fileInput, file)

    expect(await screen.findByText(/2 MB or smaller/i)).toBeInTheDocument()
    expect(uploadGuideServiceLogo).not.toHaveBeenCalled()
  })

  it('allows removing an existing logo', async () => {
    getGuideServiceSettings.mockResolvedValueOnce({
      id: membership.guide_service,
      name: membership.guide_service_name,
      slug: 'summit-guides',
      contact_email: 'hello@summit.test',
      phone: '555-0100',
      logo_url: 'https://cdn.test/logo.png',
    })

    renderCard()

    const removeButton = await screen.findByRole('button', { name: /Remove logo/i })
    await waitFor(() => expect(removeButton).toBeEnabled())
    await userEvent.click(removeButton)

    await waitFor(() => {
      expect(deleteGuideServiceLogo).toHaveBeenCalledWith(membership.guide_service)
    })
    expect(await screen.findByText(/Logo removed/i)).toBeInTheDocument()
  })
})
