import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'

export default function CheckoutPreviewPage(){
  const [params] = useSearchParams()
  const amount = params.get('amount')
  const partyId = params.get('party') ?? params.get('booking')
  const sessionId = params.get('session')

  const amountDollars = useMemo(() => {
    if (!amount) return null
    const cents = Number(amount)
    if (Number.isNaN(cents)) return null
    return (cents / 100).toFixed(2)
  }, [amount])

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <header className="space-y-2">
        <h2 className="text-2xl font-semibold">Stripe Checkout Preview</h2>
        <p className="text-sm text-gray-600">
          Stripe is running in stub mode for this environment. Share the trip details with your guest and collect payment manually.
          When Stripe is configured for real payments this page will be replaced by the live checkout flow.
        </p>
      </header>

      <section className="border rounded-md bg-white shadow px-4 py-3 space-y-2">
        <h3 className="text-sm font-medium uppercase tracking-wide text-gray-500">Party snapshot</h3>
        <dl className="space-y-1">
          <div>
            <dt className="text-xs text-gray-500">Party ID</dt>
            <dd className="text-sm font-mono">{partyId || 'Unknown'}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">Amount due</dt>
            <dd className="text-sm">
              {amountDollars ? `$${amountDollars}` : 'Unavailable'}
              {amount && !amountDollars && (
                <span className="ml-2 text-xs text-red-600">(invalid amount)</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">Session reference</dt>
            <dd className="text-sm font-mono">{sessionId || 'Not generated'}</dd>
          </div>
        </dl>
      </section>

      <section className="text-sm text-gray-600 space-y-2">
        <p>Next steps while using the stub:</p>
        <ul className="list-disc list-inside space-y-1">
          <li>Send the guest their party confirmation email (includes their info portal link).</li>
          <li>Collect payment via your preferred offline method.</li>
          <li>Mark the party as paid once funds are received.</li>
        </ul>
      </section>
    </div>
  )
}
