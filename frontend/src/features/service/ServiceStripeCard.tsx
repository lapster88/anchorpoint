import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import {
  ServiceMembership,
  StripeAccountStatus,
  createStripeOnboardingLink,
  disconnectStripeAccount,
  fetchStripeAccountStatus
} from '../profile/api'

type Props = {
  membership: ServiceMembership
}

function formatBoolean(value?: boolean): string {
  if (value === undefined) return '—'
  return value ? 'Enabled' : 'Disabled'
}

export default function ServiceStripeCard({ membership }: Props){
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const statusQueryKey = ['service-stripe-status', membership.guide_service]

  const statusQuery = useQuery({
    queryKey: statusQueryKey,
    queryFn: () => fetchStripeAccountStatus(membership.guide_service)
  })

  const connectMutation = useMutation({
    mutationFn: () => createStripeOnboardingLink(membership.guide_service),
    onMutate: () => {
      setError(null)
      setSuccess(null)
    },
    onSuccess: (data) => {
      window.open(data.url, '_blank', 'noopener')
      setSuccess('Complete the Stripe onboarding in the newly opened tab.')
      queryClient.invalidateQueries({ queryKey: statusQueryKey })
    },
    onError: (err: any) => {
      const detail = err?.response?.data?.detail || err?.message || 'Unable to start Stripe onboarding.'
      setError(String(detail))
    }
  })

  const disconnectMutation = useMutation({
    mutationFn: () => disconnectStripeAccount(membership.guide_service),
    onMutate: () => {
      setError(null)
      setSuccess(null)
    },
    onSuccess: () => {
      setSuccess('Stripe account disconnected.')
      queryClient.invalidateQueries({ queryKey: statusQueryKey })
    },
    onError: (err: any) => {
      const detail = err?.response?.data?.detail || err?.message || 'Unable to disconnect Stripe account.'
      setError(String(detail))
    }
  })

  const status: StripeAccountStatus | undefined = statusQuery.data
  const isLoading = statusQuery.isLoading
  const isConnected = Boolean(status?.connected)
  const isPending = connectMutation.isPending || disconnectMutation.isPending

  return (
    <section className="border rounded-lg bg-white shadow p-5 space-y-4">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Payments (Stripe Connect)</h3>
          <p className="text-xs text-gray-500">
            Owners and office managers can connect their Stripe account to accept trip payments.
          </p>
        </div>
        {isLoading && <span className="text-xs text-gray-500">Loading…</span>}
      </header>

      {error && <div className="text-sm text-red-600">{error}</div>}
      {success && <div className="text-sm text-green-600">{success}</div>}

      <div className="space-y-3 text-sm">
        {isConnected ? (
          <ConnectedStatus status={status!} />
        ) : (
          <p className="text-gray-700">No Stripe account is connected yet.</p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="bg-blue-600 text-white px-4 py-2 rounded text-sm disabled:opacity-60"
            onClick={() => connectMutation.mutate()}
            disabled={isPending}
          >
            {isConnected ? 'Reconnect Stripe' : 'Connect Stripe'}
          </button>
          <button
            type="button"
            className="text-sm text-red-600 underline disabled:opacity-60"
            onClick={() => disconnectMutation.mutate()}
            disabled={!isConnected || isPending}
          >
            Disconnect
          </button>
          {status?.express_dashboard_url && (
            <a
              href={status.express_dashboard_url}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-blue-600 underline"
            >
              Open Stripe Dashboard
            </a>
          )}
        </div>
      </div>
    </section>
  )
}

function ConnectedStatus({ status }: { status: StripeAccountStatus }){
  return (
    <div className="border border-slate-200 rounded-md p-4 bg-slate-50">
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-gray-700">
        <div>
          <dt className="uppercase text-xs text-gray-500">Account ID</dt>
          <dd className="font-medium break-all">{status.account_id ?? '—'}</dd>
        </div>
        <div>
          <dt className="uppercase text-xs text-gray-500">Charges</dt>
          <dd className="font-medium">{formatBoolean(status.charges_enabled)}</dd>
        </div>
        <div>
          <dt className="uppercase text-xs text-gray-500">Payouts</dt>
          <dd className="font-medium">{formatBoolean(status.payouts_enabled)}</dd>
        </div>
        <div>
          <dt className="uppercase text-xs text-gray-500">Details submitted</dt>
          <dd className="font-medium">{formatBoolean(status.details_submitted)}</dd>
        </div>
        <div>
          <dt className="uppercase text-xs text-gray-500">Email</dt>
          <dd className="font-medium">{status.account_email ?? '—'}</dd>
        </div>
        <div>
          <dt className="uppercase text-xs text-gray-500">Default currency</dt>
          <dd className="font-medium">{status.default_currency?.toUpperCase() ?? '—'}</dd>
        </div>
        {status.last_webhook_error_message && (
          <div className="sm:col-span-2">
            <dt className="uppercase text-xs text-red-500">Webhook issues</dt>
            <dd className="font-medium text-red-600">{status.last_webhook_error_message}</dd>
          </div>
        )}
      </dl>
    </div>
  )
}
