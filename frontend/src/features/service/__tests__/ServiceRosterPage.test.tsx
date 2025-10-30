import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi } from 'vitest'

import ServiceRosterPage from '../ServiceRosterPage'
import { MembershipsProvider } from '../../../lib/memberships'

const fetchMemberships = vi.fn()
const fetchServiceRoster = vi.fn()
const inviteServiceMember = vi.fn()
const updateServiceMember = vi.fn()
const deleteServiceMember = vi.fn()
const resendServiceInvitation = vi.fn()
const cancelServiceInvitation = vi.fn()

vi.mock('../../profile/api', () => ({
  fetchMemberships: () => fetchMemberships()
}))

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({ isAuthenticated: true, authenticateWithTokens: vi.fn(), user: { email: 'owner@example.com' }, logout: vi.fn() })
}))

vi.mock('../api', () => ({
  fetchServiceRoster: (serviceId: number) => fetchServiceRoster(serviceId),
  inviteServiceMember: (serviceId: number, payload: any) => inviteServiceMember(serviceId, payload),
  updateServiceMember: (serviceId: number, membershipId: number, payload: any) => updateServiceMember(serviceId, membershipId, payload),
  deleteServiceMember: (serviceId: number, membershipId: number) => deleteServiceMember(serviceId, membershipId),
  resendServiceInvitation: (serviceId: number, invitationId: number) => resendServiceInvitation(serviceId, invitationId),
  cancelServiceInvitation: (serviceId: number, invitationId: number) => cancelServiceInvitation(serviceId, invitationId)
}))

const queryClientFactory = () => new QueryClient({ defaultOptions: { queries: { retry: false } } })

let queryClient: QueryClient

describe('ServiceRosterPage', () => {
  beforeEach(() => {
    fetchMemberships.mockResolvedValue([
      {
        id: 1,
        guide_service: 101,
        guide_service_name: 'Summit Guides',
        guide_service_logo_url: null,
        role: 'OWNER',
        is_active: true
      }
    ])
    fetchServiceRoster.mockResolvedValue({
      members: [
        {
          id: 10,
          guide_service: 101,
          role: 'GUIDE',
          is_active: true,
          user: {
            id: 50,
            email: 'guide@example.com',
            first_name: 'Gabe',
            last_name: 'Guide',
            display_name: 'Gabe Guide',
            last_login: '2025-10-20T10:00:00Z'
          },
          invited_by: null,
          invited_at: null,
          accepted_at: '2025-10-15T10:00:00Z',
          created_at: '2025-10-15T10:00:00Z',
          updated_at: '2025-10-20T10:00:00Z'
        }
      ],
      invitations: [
        {
          id: 200,
          guide_service: 101,
          email: 'pending@example.com',
          role: 'GUIDE',
          status: 'PENDING',
          expires_at: '2025-10-30T00:00:00Z',
          invited_by: null,
          invited_at: '2025-10-21T00:00:00Z',
          accepted_at: null,
          cancelled_at: null,
          accept_url: 'http://test/invitations/token123'
        }
      ]
    })

    inviteServiceMember.mockResolvedValue({ invitation: { id: 999 } })
    updateServiceMember.mockResolvedValue({
      member: {
        id: 10,
        guide_service: 101,
        role: 'GUIDE',
        is_active: false,
        user: {
          id: 50,
          email: 'guide@example.com',
          first_name: 'Gabe',
          last_name: 'Guide',
          display_name: 'Gabe Guide',
          last_login: '2025-10-20T10:00:00Z'
        },
        invited_by: null,
        invited_at: null,
        accepted_at: '2025-10-15T10:00:00Z',
        created_at: '2025-10-15T10:00:00Z',
        updated_at: '2025-10-21T10:00:00Z'
      }
    })
    deleteServiceMember.mockResolvedValue(undefined)
    resendServiceInvitation.mockResolvedValue({ invitation: { id: 200 } })
    cancelServiceInvitation.mockResolvedValue(undefined)
  })

  afterEach(() => {
    if (queryClient) {
      queryClient.clear()
    }
    vi.clearAllMocks()
  })

  function renderPage(){
    queryClient = queryClientFactory()
    return render(
      <QueryClientProvider client={queryClient}>
        <MembershipsProvider>
          <ServiceRosterPage />
        </MembershipsProvider>
      </QueryClientProvider>
    )
  }

  it('renders members and invitations', async () => {
    renderPage()

    await waitFor(() => expect(fetchServiceRoster).toHaveBeenCalled())
    expect(await screen.findByText('Summit Guides')).toBeInTheDocument()
    expect(await screen.findByText('Gabe Guide')).toBeInTheDocument()
    expect(await screen.findByText('pending@example.com')).toBeInTheDocument()
  })

  it('invites a new member', async () => {
    renderPage()
    await waitFor(() => expect(fetchServiceRoster).toHaveBeenCalled())

    await userEvent.click(screen.getByRole('button', { name: /Invite member/i }))
    await userEvent.type(screen.getByLabelText(/Email/), 'new@example.com')
    await userEvent.selectOptions(screen.getByLabelText(/Role/), 'GUIDE')
    await userEvent.click(screen.getByRole('button', { name: /Send invite/i }))

    await waitFor(() => expect(inviteServiceMember).toHaveBeenCalledWith(101, { email: 'new@example.com', role: 'GUIDE' }))
    expect(screen.getByText(/Invitation sent/i)).toBeInTheDocument()
  })

  it('toggles member active state', async () => {
    renderPage()
    await waitFor(() => expect(fetchServiceRoster).toHaveBeenCalled())

    const deactivateButton = await screen.findByRole('button', { name: /Deactivate/i })
    await userEvent.click(deactivateButton)
    await waitFor(() => expect(updateServiceMember).toHaveBeenCalled())
    expect(await screen.findByText(/Member deactivated/i)).toBeInTheDocument()
  })

  it('resends invitation', async () => {
    renderPage()
    await waitFor(() => expect(fetchServiceRoster).toHaveBeenCalled())

    const resendButton = await screen.findByRole('button', { name: /Resend/i })
    await userEvent.click(resendButton)
    await waitFor(() => expect(resendServiceInvitation).toHaveBeenCalledWith(101, 200))
  })
})
