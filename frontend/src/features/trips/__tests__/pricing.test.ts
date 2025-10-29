import { describe, expect, it } from 'vitest'

import { formatCurrencyFromCents, selectPricePerGuestCents, snapshotBasePriceCents } from '../pricing'

const snapshot = {
  currency: 'usd',
  is_deposit_required: false,
  deposit_percent: '0',
  tiers: [
    { min_guests: 1, max_guests: 2, price_per_guest_cents: 15000, price_per_guest: '150.00' },
    { min_guests: 3, max_guests: 6, price_per_guest_cents: null, price_per_guest: '140' },
    { min_guests: 7, max_guests: null, price_per_guest_cents: 13000, price_per_guest: '130.00' },
  ],
} as const

describe('pricing helpers', () => {
  it('selects tier based on party size', () => {
    expect(selectPricePerGuestCents(snapshot, 1)).toEqual(15000)
    expect(selectPricePerGuestCents(snapshot, 4)).toEqual(14000)
    expect(selectPricePerGuestCents(snapshot, 8)).toEqual(13000)
  })

  it('falls back to last tier when over max guests', () => {
    expect(selectPricePerGuestCents(snapshot, 20)).toEqual(13000)
  })

  it('uses fallback when tiers missing', () => {
    expect(selectPricePerGuestCents(null, 2, 12000)).toEqual(12000)
  })

  it('returns snapshot base price', () => {
    expect(snapshotBasePriceCents(snapshot, 12000)).toEqual(15000)
  })

  it('formats currency safely', () => {
    expect(formatCurrencyFromCents(15000, 'usd')).toEqual('$150.00')
    expect(formatCurrencyFromCents(null, 'usd')).toEqual(null)
  })
})
