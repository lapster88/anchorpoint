from __future__ import annotations

from django.db import migrations


def populate_pricing_snapshot(apps, schema_editor):
    Trip = apps.get_model("trips", "Trip")
    from trips.pricing import build_single_tier_snapshot

    for trip in Trip.objects.all():
        snapshot = trip.pricing_snapshot if isinstance(trip.pricing_snapshot, dict) else {}
        tiers = snapshot.get("tiers") if isinstance(snapshot, dict) else None
        if tiers:
            # Already populated with tier data; leave as-is.
            continue
        price_cents = getattr(trip, "price_cents", None)
        if not price_cents:
            continue
        currency = snapshot.get("currency") or "usd"
        is_deposit_required = snapshot.get("is_deposit_required") or False
        deposit_percent = snapshot.get("deposit_percent") or "0"

        Trip.objects.filter(pk=trip.pk).update(
            pricing_snapshot=build_single_tier_snapshot(
                price_cents,
                currency=currency,
                is_deposit_required=is_deposit_required,
                deposit_percent=deposit_percent,
            )
        )


class Migration(migrations.Migration):

    dependencies = [
        ("trips", "0007_remove_trip_pricing_model_and_more"),
    ]

    operations = [
        migrations.RunPython(populate_pricing_snapshot, migrations.RunPython.noop),
    ]
