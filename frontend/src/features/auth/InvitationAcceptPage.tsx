import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'

import { useAuth } from '../../lib/auth'
import {
  acceptInvitation,
  fetchInvitationStatus,
  InvitationAcceptPayload,
  InvitationAcceptResponse,
  InvitationStatus
} from '../service/api'

export default function InvitationAcceptPage(){
  const { token = '' } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const { isAuthenticated, user, authenticateWithTokens } = useAuth()
  const [formError, setFormError] = useState<string | null>(null)
  const [formValues, setFormValues] = useState({ first_name: '', last_name: '', display_name: '', password: '' })

  const statusQuery = useQuery<InvitationStatus, any>({
    queryKey: ['invitation-status', token],
    queryFn: () => fetchInvitationStatus(token),
    enabled: Boolean(token)
  })

  const acceptMutation = useMutation<InvitationAcceptResponse, any, InvitationAcceptPayload>({
    mutationFn: (payload) => acceptInvitation(token, payload),
    onSuccess: (data) => {
      if (data.access && data.refresh) {
        authenticateWithTokens({ user: data.user, access: data.access, refresh: data.refresh })
      }
      navigate('/')
    },
    onError: (err: any) => {
      const detail = err?.response?.data?.detail || err?.message || 'Unable to accept invitation.'
      setFormError(String(detail))
    }
  })

  useEffect(() => {
    if (isAuthenticated && statusQuery.data && user?.email?.toLowerCase() !== statusQuery.data.email.toLowerCase()){
      setFormError('You are signed in with a different email. Please log out before accepting this invitation.')
    }
  }, [isAuthenticated, statusQuery.data, user])

  const isExistingAccount = useMemo(() => {
    if (!statusQuery.data) return false
    if (!isAuthenticated) return false
    return user?.email?.toLowerCase() === statusQuery.data.email.toLowerCase()
  }, [isAuthenticated, statusQuery.data, user])

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (acceptMutation.isPending) return
    setFormError(null)

    if (!statusQuery.data) return

    if (isExistingAccount){
      acceptMutation.mutate({})
      return
    }

    if (!formValues.password || formValues.password.trim().length < 8){
      setFormError('Password must be at least 8 characters.')
      return
    }

    acceptMutation.mutate(formValues)
  }

  if (statusQuery.isLoading){
    return <div className="max-w-md mx-auto p-6"><p>Checking invitation…</p></div>
  }

  if (statusQuery.error){
    const status = statusQuery.error?.response?.status
    if (status === 410){
      return <InvitationMessage title="Invitation expired" message="This invitation has expired. Ask the service owner to send a fresh invite." />
    }
    return <InvitationMessage title="Invitation not found" message="We couldn’t find that invitation. Double-check the link or contact the service owner." />
  }

  const invitation = statusQuery.data
  if (!invitation){
    return null
  }

  return (
    <div className="max-w-md mx-auto p-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Join {invitation.service_name}</h1>
        <p className="text-sm text-gray-600">
          You’ve been invited as a {roleLabel(invitation.role)}. Accept below to finish setup.
        </p>
      </header>

      {formError && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</div>}

      <form className="space-y-4" onSubmit={handleSubmit}>
        <div>
          <p className="text-sm font-medium text-gray-700">Invitation email</p>
          <p className="text-sm text-gray-600">{invitation.email}</p>
        </div>

        {!isExistingAccount && (
          <>
            <label className="block text-sm font-medium text-gray-700">
              First name
              <input
                type="text"
                required
                value={formValues.first_name}
                onChange={(event) => setFormValues((prev) => ({ ...prev, first_name: event.target.value }))}
                className="mt-1 w-full rounded border px-3 py-2"
              />
            </label>
            <label className="block text-sm font-medium text-gray-700">
              Last name
              <input
                type="text"
                required
                value={formValues.last_name}
                onChange={(event) => setFormValues((prev) => ({ ...prev, last_name: event.target.value }))}
                className="mt-1 w-full rounded border px-3 py-2"
              />
            </label>
            <label className="block text-sm font-medium text-gray-700">
              Display name (optional)
              <input
                type="text"
                value={formValues.display_name}
                onChange={(event) => setFormValues((prev) => ({ ...prev, display_name: event.target.value }))}
                className="mt-1 w-full rounded border px-3 py-2"
              />
            </label>
            <label className="block text-sm font-medium text-gray-700">
              Password
              <input
                type="password"
                required
                minLength={8}
                value={formValues.password}
                onChange={(event) => setFormValues((prev) => ({ ...prev, password: event.target.value }))}
                className="mt-1 w-full rounded border px-3 py-2"
              />
            </label>
          </>
        )}

        {isExistingAccount && (
          <p className="text-sm text-gray-600">
            You're signed in as {user?.display_name || user?.email}. Click below to accept the invitation and gain access.
          </p>
        )}

        <button
          type="submit"
          className="w-full rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-60"
          disabled={acceptMutation.isPending}
        >
          {acceptMutation.isPending ? 'Joining…' : 'Accept invitation'}
        </button>
      </form>
    </div>
  )
}

function InvitationMessage({ title, message }: { title: string; message: string }){
  return (
    <div className="max-w-md mx-auto p-6 space-y-2">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="text-sm text-gray-600">{message}</p>
    </div>
  )
}

function roleLabel(role: string): string {
  switch (role) {
    case 'OWNER':
      return 'Owner'
    case 'OFFICE_MANAGER':
      return 'Office Manager'
    case 'GUIDE':
      return 'Guide'
    default:
      return role
  }
}
