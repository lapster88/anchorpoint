from __future__ import annotations

from typing import Any, Dict, Optional


def build_single_tier_snapshot(
    price_cents: int,
    *,
    currency: str = "usd",
    is_deposit_required: bool = False,
    deposit_percent: str | float | int = "0",
) -> Dict[str, Any]:
    """
    Construct a pricing snapshot matching the TripTemplate snapshot schema but with a single tier.
    """
    normalized_deposit = str(deposit_percent)
    return {
        "currency": currency,
        "is_deposit_required": bool(is_deposit_required),
        "deposit_percent": normalized_deposit,
        "tiers": [
            {
                "min_guests": 1,
                "max_guests": None,
                "price_per_guest": f"{price_cents / 100:.2f}",
                "price_per_guest_cents": price_cents,
            }
        ],
    }


def snapshot_base_price_cents(snapshot: Optional[Dict[str, Any]]) -> Optional[int]:
    return select_price_per_guest_cents(snapshot, party_size=1)


def select_price_per_guest_cents(
    snapshot: Optional[Dict[str, Any]],
    party_size: int,
    *,
    default: Optional[int] = None,
) -> Optional[int]:
    if not snapshot or not isinstance(snapshot, dict):
        return default
    tiers = snapshot.get("tiers")
    if not isinstance(tiers, list) or not tiers:
        return default

    # Ensure tiers are evaluated in ascending order of min_guests to match validation rules.
    sorted_tiers = sorted(
        [
            tier for tier in tiers
            if isinstance(tier, dict)
        ],
        key=lambda tier: (tier.get("min_guests") or 1)
    )

    selected_tier = None
    for tier in sorted_tiers:
        min_guests = tier.get("min_guests") or 1
        max_guests = tier.get("max_guests")
        if party_size < min_guests:
            continue
        if max_guests is not None and party_size > max_guests:
            continue
        selected_tier = tier
        break

    if selected_tier is None:
        # Fallback to the last tier (open-ended) if no explicit match was found.
        selected_tier = sorted_tiers[-1]

    cents = selected_tier.get("price_per_guest_cents")
    if cents is not None:
        return cents
    price = selected_tier.get("price_per_guest")
    if price is None:
        return default
    try:
        value = float(price)
    except (TypeError, ValueError):
        return default
    return int(round(value * 100))
