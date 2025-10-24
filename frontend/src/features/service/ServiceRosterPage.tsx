import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { fetchMemberships, ServiceMembership } from '../profile/api'
import {
  cancelServiceInvitation,
  fetchServiceRoster,
  inviteServiceMember,
  resendServiceInvitation,
  ServiceInvitation,
  ServiceMember,
  updateServiceMember,
  deleteServiceMember
} from './api'
import { useAuth } from '../../lib/auth'

const MANAGER_ROLES = new Set(['OWNER', 'OFFICE_MANAGER'])
const ROLE_OPTIONS = [
  { value: 'OWNER', label: 'Owner' },
  { value: 'OFFICE_MANAGER', label: 'Office Manager' },
  { value: 'GUIDE', label: 'Guide' }
]

type Flash = { message: string; tone: 'success' | 'error' }

type RosterCardProps = {
  membership: ServiceMembership
}

export default function ServiceRosterPage(){
  const { isAuthenticated } = useAuth()
  const { data: memberships, isLoading } = useQuery({
    queryKey: ['memberships'],
    queryFn: fetchMemberships,
    enabled: isAuthenticated
  })

  const manageableMemberships = useMemo(
    () =>
      (memberships ?? []).filter(
        (membership) => membership.is_active && MANAGER_ROLES.has(membership.role)
      ),
    [memberships]
  )

  if (!isAuthenticated) return null

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Service Roster</h1>
        <p className="text-sm text-gray-600">
          Invite staff, manage active status, and keep your guide service roster current.
        </p>
      </header>

      {isLoading && <p>Loading roster…</p>}
      {!isLoading && manageableMemberships.length === 0 && (
        <p className="text-sm text-gray-600">
          You do not manage any guide services yet. Owners and office managers can manage rosters here once they claim a service.
        </p>
      )}

      <div className="space-y-6">
        {manageableMemberships.map((membership) => (
          <RosterCard key={membership.id} membership={membership} />
        ))}
      </div>
    </div>
  )
}

function RosterCard({ membership }: RosterCardProps){
  const queryClient = useQueryClient()
  const [flash, setFlash] = useState<Flash | null>(null)
  const [error, setError] = useState<string | null>(null)
  const serviceId = membership.guide_service

  const rosterQuery = useQuery({
    queryKey: ['service-roster', serviceId],
    queryFn: () => fetchServiceRoster(serviceId)
  })

  const inviteMutation = useMutation({
    mutationFn: (payload: { email: string; role: string }) => inviteServiceMember(serviceId, payload),
    onMutate: () => {
      setFlash(null)
      setError(null)
    },
    onSuccess: (result) => {
      const tone: Flash['tone'] = 'success'
      const message = result.member ? 'Member added.' : 'Invitation sent.'
      setFlash({ message, tone })
      queryClient.invalidateQueries({ queryKey: ['service-roster', serviceId] })
      queryClient.invalidateQueries({ queryKey: ['memberships'] })
    },
    onError: (err: any) => {
      const detail = err?.response?.data?.detail || err?.message || 'Unable to send invite.'
      setError(String(detail))
    }
  })

  const updateMemberMutation = useMutation({
    mutationFn: ({ membershipId, payload }: { membershipId: number; payload: Partial<{ role: string; is_active: boolean }> }) =>
      updateServiceMember(serviceId, membershipId, payload),
    onMutate: () => setFlash(null),
    onSuccess: (data) => {
      const message = data.member.is_active ? 'Member activated.' : 'Member deactivated.'
      setFlash({ message, tone: 'success' })
      queryClient.invalidateQueries({ queryKey: ['service-roster', serviceId] })
      queryClient.invalidateQueries({ queryKey: ['memberships'] })
    },
    onError: (err: any) => {
      const detail = err?.response?.data?.detail || err?.message || 'Unable to update member.'
      setFlash({ message: String(detail), tone: 'error' })
    }
  })

  const deleteMemberMutation = useMutation({
    mutationFn: (memberId: number) => deleteServiceMember(serviceId, memberId),
    onMutate: () => setFlash(null),
    onSuccess: () => {
      setFlash({ message: 'Member removed.', tone: 'success' })
      queryClient.invalidateQueries({ queryKey: ['service-roster', serviceId] })
      queryClient.invalidateQueries({ queryKey: ['memberships'] })
    },
    onError: (err: any) => {
      const detail = err?.response?.data?.detail || err?.message || 'Unable to remove member.'
      setFlash({ message: String(detail), tone: 'error' })
    }
  })

  const resendInvitationMutation = useMutation({
    mutationFn: (invitationId: number) => resendServiceInvitation(serviceId, invitationId),
    onMutate: () => setFlash(null),
    onSuccess: () => {
      setFlash({ message: 'Invitation resent.', tone: 'success' })
      queryClient.invalidateQueries({ queryKey: ['service-roster', serviceId] })
    },
    onError: () => setFlash({ message: 'Unable to resend invitation.', tone: 'error' })
  })

  const cancelInvitationMutation = useMutation({
    mutationFn: (invitationId: number) => cancelServiceInvitation(serviceId, invitationId),
    onMutate: () => setFlash(null),
    onSuccess: () => {
      setFlash({ message: 'Invitation cancelled.', tone: 'success' })
      queryClient.invalidateQueries({ queryKey: ['service-roster', serviceId] })
    },
    onError: () => setFlash({ message: 'Unable to cancel invitation.', tone: 'error' })
  })

  const roster = rosterQuery.data
  const members = roster?.members ?? []
  const invitations = roster?.invitations ?? []

  return (
    <section className="border rounded-lg bg-white shadow p-5 space-y-5">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold">{membership.guide_service_name}</h2>
          <p className="text-xs text-gray-500">Manage staff access and invitations for this service.</p>
        </div>
        <InviteMemberButton
          onInvite={(payload) => inviteMutation.mutate(payload)}
          isSubmitting={inviteMutation.isPending}
        />
      </header>

      {flash && (
        <div
          className={`rounded border px-3 py-2 text-xs ${
            flash.tone === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {flash.message}
        </div>
      )}
      {error && <div className="text-sm text-red-600">{error}</div>}

      {rosterQuery.isLoading && <p className="text-sm text-gray-600">Loading roster…</p>}
      {rosterQuery.error && <p className="text-sm text-red-600">Unable to load roster.</p>}

      {!rosterQuery.isLoading && !rosterQuery.error && (
        <div className="space-y-4">
          <RosterTable
            members={members}
            invitations={invitations}
            onToggleActive={(member) =>
              updateMemberMutation.mutate({
                membershipId: member.id,
                payload: { is_active: !member.is_active }
              })
            }
            onDeleteMember={(member) => {
              if (window.confirm(`Remove ${member.user.display_name || member.user.email}?`)) {
                deleteMemberMutation.mutate(member.id)
              }
            }}
            onResendInvitation={(invitation) => resendInvitationMutation.mutate(invitation.id)}
            onCancelInvitation={(invitation) => {
              if (window.confirm(`Cancel invitation for ${invitation.email}?`)) {
                cancelInvitationMutation.mutate(invitation.id)
              }
            }}
          />
        </div>
      )}
    </section>
  )
}

type RosterTableProps = {
  members: ServiceMember[]
  invitations: ServiceInvitation[]
  onToggleActive: (member: ServiceMember) => void
  onDeleteMember: (member: ServiceMember) => void
  onResendInvitation: (invitation: ServiceInvitation) => void
  onCancelInvitation: (invitation: ServiceInvitation) => void
}

function RosterTable({ members, invitations, onToggleActive, onDeleteMember, onResendInvitation, onCancelInvitation }: RosterTableProps){
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-100 text-left uppercase text-xs text-slate-500">
          <tr>
            <th className="px-3 py-2">Name</th>
            <th className="px-3 py-2">Email</th>
            <th className="px-3 py-2">Role</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">Last activity</th>
            <th className="px-3 py-2" aria-label="actions" />
          </tr>
        </thead>
        <tbody>
          {members.map((member) => (
            <tr key={`member-${member.id}`} className="border-b last:border-b-0">
              <td className="px-3 py-2">{member.user.display_name || `${member.user.first_name ?? ''} ${member.user.last_name ?? ''}`.trim() || member.user.email}</td>
              <td className="px-3 py-2">{member.user.email}</td>
              <td className="px-3 py-2">{roleLabel(member.role)}</td>
              <td className="px-3 py-2">
                {member.is_active ? (
                  <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">Active</span>
                ) : (
                  <span className="inline-flex items-center rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-700">Inactive</span>
                )}
              </td>
              <td className="px-3 py-2 text-xs text-slate-500">
                {member.user.last_login ? new Date(member.user.last_login).toLocaleDateString() : '—'}
              </td>
              <td className="px-3 py-2 space-x-2 whitespace-nowrap">
                <button
                  type="button"
                  className="text-xs text-blue-600 underline"
                  onClick={() => onToggleActive(member)}
                >
                  {member.is_active ? 'Deactivate' : 'Activate'}
                </button>
                <button
                  type="button"
                  className="text-xs text-red-600 underline"
                  onClick={() => onDeleteMember(member)}
                >
                  Remove
                </button>
              </td>
            </tr>
          ))}
          {invitations.map((invitation) => (
            <tr key={`invite-${invitation.id}`} className="border-b last:border-b-0 bg-amber-50">
              <td className="px-3 py-2 text-amber-900">Pending invite</td>
              <td className="px-3 py-2 text-amber-900">{invitation.email}</td>
              <td className="px-3 py-2 text-amber-900">{roleLabel(invitation.role)}</td>
              <td className="px-3 py-2 text-amber-900">{statusLabel(invitation.status)}</td>
              <td className="px-3 py-2 text-xs text-amber-800">
                Expires {new Date(invitation.expires_at).toLocaleDateString()}
              </td>
              <td className="px-3 py-2 space-x-2 whitespace-nowrap">
                <button
                  type="button"
                  className="text-xs text-blue-600 underline"
                  onClick={() => onResendInvitation(invitation)}
                >
                  Resend
                </button>
                <button
                  type="button"
                  className="text-xs text-red-600 underline"
                  onClick={() => onCancelInvitation(invitation)}
                >
                  Cancel
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {members.length === 0 && invitations.length === 0 && (
        <p className="px-3 py-4 text-sm text-gray-500">No members yet.</p>
      )}
    </div>
  )
}

type InviteMemberButtonProps = {
  onInvite: (payload: { email: string; role: string }) => void
  isSubmitting: boolean
}

function InviteMemberButton({ onInvite, isSubmitting }: InviteMemberButtonProps){
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('GUIDE')
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!email.trim()) {
      setError('Email is required.')
      return
    }
    setError(null)
    onInvite({ email: email.trim(), role })
    setEmail('')
    setRole('GUIDE')
    setOpen(false)
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-60"
        disabled={isSubmitting}
      >
        Invite member
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-2xl">
        <header className="space-y-1">
          <h3 className="text-lg font-semibold">Invite member</h3>
          <p className="text-sm text-gray-600">Send an invitation to join this service.</p>
        </header>
        <label className="block text-sm font-medium text-gray-700">
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-1 w-full rounded border px-3 py-2"
          />
        </label>
        <label className="block text-sm font-medium text-gray-700">
          Role
          <select
            value={role}
            onChange={(event) => setRole(event.target.value)}
            className="mt-1 w-full rounded border px-3 py-2"
          >
            {ROLE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-3">
          <button type="button" className="text-sm text-gray-600 underline" onClick={() => setOpen(false)}>
            Cancel
          </button>
          <button
            type="submit"
            className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-60"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Sending…' : 'Send invite'}
          </button>
        </div>
      </form>
    </div>
  )
}

function roleLabel(role: string): string {
  const option = ROLE_OPTIONS.find((item) => item.value === role)
  return option ? option.label : role
}

function statusLabel(status: string): string {
  switch (status) {
    case 'PENDING':
      return 'Pending'
    case 'ACCEPTED':
      return 'Accepted'
    case 'CANCELLED':
      return 'Cancelled'
    case 'EXPIRED':
      return 'Expired'
    default:
      return status
  }
}
