from __future__ import annotations

import math

from django.db import migrations, models


def derive_target_ratio(apps, schema_editor):
    Trip = apps.get_model("trips", "Trip")
    TripTemplate = apps.get_model("trips", "TripTemplate")

    def compute_ratio(clients, guides):
        if clients is None:
            return None
        if guides in (None, 0):
            return clients or None
        return max(1, math.ceil(clients / guides))

    for template in TripTemplate.objects.all():
        clients = getattr(template, "target_client_count", None)
        guides = getattr(template, "target_guide_count", None)
        ratio = compute_ratio(clients, guides)
        if ratio is not None:
            template.target_clients_per_guide = ratio
            template.save(update_fields=["target_clients_per_guide"])

    for trip in Trip.objects.all():
        clients = getattr(trip, "target_client_count", None)
        guides = getattr(trip, "target_guide_count", None)
        ratio = compute_ratio(clients, guides)
        if ratio is not None:
            trip.target_clients_per_guide = ratio
            trip.save(update_fields=["target_clients_per_guide"])


class Migration(migrations.Migration):

    dependencies = [
        ("trips", "0009_remove_trip_price_cents"),
    ]

    operations = [
        migrations.AddField(
            model_name="trip",
            name="target_clients_per_guide",
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="triptemplate",
            name="target_clients_per_guide",
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
        migrations.RunPython(derive_target_ratio, migrations.RunPython.noop),
        migrations.RemoveField(
            model_name="trip",
            name="target_client_count",
        ),
        migrations.RemoveField(
            model_name="trip",
            name="target_guide_count",
        ),
        migrations.RemoveField(
            model_name="triptemplate",
            name="target_client_count",
        ),
        migrations.RemoveField(
            model_name="triptemplate",
            name="target_guide_count",
        ),
    ]
