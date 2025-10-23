import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi } from 'vitest'

import GuestTokenPage from '../GuestTokenPage'

const { fetchGuestProfile, updateGuestProfile } = vi.hoisted(() => ({
  fetchGuestProfile: vi.fn(),
  updateGuestProfile: vi.fn(),
}))

vi.mock('../api', () => ({
  fetchGuestProfile,
  updateGuestProfile,
}))

function renderGuestPage(path = '/guest?token=abc'){
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/guest" element={<GuestTokenPage />} />
      </Routes>
    </MemoryRouter>
  )
}

const sampleProfile = {
  id: 1,
  email: 'guest@example.com',
  first_name: 'Greta',
  last_name: 'Guest',
  phone: '555-0100',
  date_of_birth: '1990-05-01',
  emergency_contact_name: 'Pat Support',
  emergency_contact_phone: '555-0200',
  medical_notes: 'Bring inhaler',
  dietary_notes: 'Vegetarian',
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

describe('GuestTokenPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows error when token is missing', () => {
    renderGuestPage('/guest')

    expect(screen.getByText(/invalid/i)).toBeInTheDocument()
  })

  it('loads guest profile and allows saving updates', async () => {
    fetchGuestProfile.mockResolvedValueOnce(sampleProfile)
    updateGuestProfile.mockResolvedValueOnce(sampleProfile)

    renderGuestPage()

    expect(fetchGuestProfile).toHaveBeenCalledWith('abc', expect.any(AbortSignal))

    expect(await screen.findByDisplayValue('Greta')).toBeInTheDocument()
    await userEvent.clear(screen.getByLabelText('Phone *'))
    await userEvent.type(screen.getByLabelText('Phone *'), '555-0300')

    await userEvent.click(screen.getByRole('button', { name: /save details/i }))

    await waitFor(() => {
      expect(updateGuestProfile).toHaveBeenCalledWith('abc', expect.objectContaining({
        phone: '555-0300',
        first_name: 'Greta',
        last_name: 'Guest',
        emergency_contact_name: 'Pat Support',
        emergency_contact_phone: '555-0200',
        dietary_notes: 'Vegetarian',
        medical_notes: 'Bring inhaler',
        date_of_birth: '1990-05-01',
      }))
    })

    expect(await screen.findByText(/your information has been saved/i)).toBeInTheDocument()
  })

  it('shows message when guest link is invalid', async () => {
    fetchGuestProfile.mockRejectedValueOnce(new Error('invalid'))

    renderGuestPage()

    expect(await screen.findByText(/invalid or has expired/i)).toBeInTheDocument()
  })

  it('surfaces save errors from the API', async () => {
    fetchGuestProfile.mockResolvedValueOnce(sampleProfile)
    updateGuestProfile.mockRejectedValueOnce({ response: { data: { detail: 'Unable to save' } } })

    renderGuestPage()

    await userEvent.click(await screen.findByRole('button', { name: /save details/i }))

    expect(await screen.findByText('Unable to save')).toBeInTheDocument()
  })
})
