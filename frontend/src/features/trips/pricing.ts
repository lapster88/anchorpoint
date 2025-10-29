import { TripPricingSnapshot, TripPricingTier } from './api'

function normalizeTiers(snapshot?: TripPricingSnapshot | null): TripPricingTier[] {
  if (!snapshot || !Array.isArray(snapshot.tiers)) {
    return []
  }
  return snapshot.tiers
    .filter((tier): tier is TripPricingTier => !!tier && typeof tier === 'object')
    .map((tier) => ({
      min_guests: tier.min_guests ?? 1,
      max_guests: tier.max_guests ?? null,
      price_per_guest: tier.price_per_guest ?? null,
      price_per_guest_cents: tier.price_per_guest_cents ?? null,
    }))
    .sort((a, b) => (a.min_guests ?? 1) - (b.min_guests ?? 1))
}

export function selectPricePerGuestCents(
  snapshot: TripPricingSnapshot | null | undefined,
  partySize: number,
  fallback?: number
): number | undefined {
  const tiers = normalizeTiers(snapshot)
  if (!tiers.length) {
    return fallback
  }

  const size = Math.max(1, partySize)
  let selected: TripPricingTier | undefined
  for (const tier of tiers) {
    const min = tier.min_guests ?? 1
    const max = tier.max_guests
    if (size < min) continue
    if (max != null && size > max) continue
    selected = tier
    break
  }

  if (!selected) {
    selected = tiers[tiers.length - 1]
  }

  if (typeof selected.price_per_guest_cents === 'number') {
    return selected.price_per_guest_cents
  }

  const price = selected.price_per_guest
  if (price == null || price === '') {
    return fallback
  }

  const parsed = Number(price)
  if (Number.isNaN(parsed)) {
    return fallback
  }

  return Math.round(parsed * 100)
}

export function snapshotBasePriceCents(
  snapshot: TripPricingSnapshot | null | undefined,
  fallback?: number
): number | undefined {
  return selectPricePerGuestCents(snapshot, 1, fallback)
}

export function formatCurrencyFromCents(
  cents: number | null | undefined,
  currency: string | null | undefined = 'USD'
): string | null {
  if (cents == null) {
    return null
  }
  const amount = cents / 100
  const normalizedCurrency = typeof currency === 'string' && currency.trim()
    ? currency.trim().toUpperCase()
    : 'USD'

  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: normalizedCurrency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount)
  } catch {
    return `$${amount.toFixed(2)}`
  }
}
