import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi } from 'vitest'

import InvitationAcceptPage from '../InvitationAcceptPage'

const fetchInvitationStatus = vi.fn()
const acceptInvitation = vi.fn()
const mockAuthenticate = vi.fn()

let authState = {
  isAuthenticated: false,
  user: null as any
}

vi.mock('../../service/api', () => ({
  fetchInvitationStatus: (token: string) => fetchInvitationStatus(token),
  acceptInvitation: (token: string, payload: any) => acceptInvitation(token, payload)
}))

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    isAuthenticated: authState.isAuthenticated,
    user: authState.user,
    authenticateWithTokens: mockAuthenticate
  })
}))

const renderWithRoute = (token: string) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/invitations/${token}`]}>
        <Routes>
          <Route path="/invitations/:token" element={<InvitationAcceptPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('InvitationAcceptPage', () => {
  beforeEach(() => {
    authState = { isAuthenticated: false, user: null }
    fetchInvitationStatus.mockResolvedValue({
      email: 'newuser@example.com',
      role: 'GUIDE',
      status: 'PENDING',
      expires_at: '2025-10-30T00:00:00Z',
      service_name: 'Summit Guides'
    })
    acceptInvitation.mockResolvedValue({
      membership: {
        id: 1,
        guide_service: 10,
        role: 'GUIDE',
        is_active: true,
        user: {
          id: 200,
          email: 'newuser@example.com',
          first_name: 'New',
          last_name: 'User',
          display_name: 'New User'
        },
        invited_by: null,
        invited_at: null,
        accepted_at: '2025-10-20T00:00:00Z',
        created_at: '2025-10-20T00:00:00Z',
        updated_at: '2025-10-20T00:00:00Z'
      },
      user: {
        id: 200,
        email: 'newuser@example.com',
        first_name: 'New',
        last_name: 'User',
        display_name: 'New User'
      },
      access: 'access123',
      refresh: 'refresh123'
    })
    mockAuthenticate.mockReset()
  })

  it('registers a new user when not authenticated', async () => {
    renderWithRoute('token123')

    await waitFor(() => expect(fetchInvitationStatus).toHaveBeenCalledWith('token123'))

    const firstNameField = await screen.findByLabelText(/First name/)
    await userEvent.type(firstNameField, 'New')
    await userEvent.type(screen.getByLabelText(/Last name/), 'User')
    await userEvent.type(screen.getByLabelText(/Password/), 'SecretPass123!')
    const acceptButton = await screen.findByRole('button', { name: /Accept invitation/i })
    await userEvent.click(acceptButton)

    await waitFor(() => expect(acceptInvitation).toHaveBeenCalled())
    expect(mockAuthenticate).toHaveBeenCalledWith({
      user: expect.objectContaining({ email: 'newuser@example.com' }),
      access: 'access123',
      refresh: 'refresh123'
    })
  })

  it('accepts for existing authenticated user without password', async () => {
    authState = {
      isAuthenticated: true,
      user: { email: 'newuser@example.com', display_name: 'New User' }
    }
    acceptInvitation.mockResolvedValue({
      membership: {
        id: 1,
        guide_service: 10,
        role: 'GUIDE',
        is_active: true,
        user: {
          id: 200,
          email: 'newuser@example.com',
          first_name: 'New',
          last_name: 'User',
          display_name: 'New User'
        },
        invited_by: null,
        invited_at: null,
        accepted_at: '2025-10-20T00:00:00Z',
        created_at: '2025-10-20T00:00:00Z',
        updated_at: '2025-10-20T00:00:00Z'
      },
      user: {
        id: 200,
        email: 'newuser@example.com',
        first_name: 'New',
        last_name: 'User',
        display_name: 'New User'
      }
    })

    renderWithRoute('token123')

    await waitFor(() => expect(fetchInvitationStatus).toHaveBeenCalled())
    const acceptButton = await screen.findByRole('button', { name: /Accept invitation/i })
    await userEvent.click(acceptButton)
    await waitFor(() => expect(acceptInvitation).toHaveBeenCalledWith('token123', {}))
  })
})
