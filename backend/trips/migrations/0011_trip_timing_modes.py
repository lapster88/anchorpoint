from __future__ import annotations

import math
from datetime import timedelta

from django.db import migrations, models


def backfill_timing_modes(apps, schema_editor):
    Trip = apps.get_model("trips", "Trip")
    TripTemplate = apps.get_model("trips", "TripTemplate")

    for trip in Trip.objects.all():
        start = getattr(trip, "start", None)
        end = getattr(trip, "end", None)
        if not start or not end:
            continue
        delta: timedelta = end - start
        total_hours = delta.total_seconds() / 3600
        if start.date() == end.date() and total_hours <= 24:
            duration_hours = max(1, int(round(total_hours))) or 1
            trip.timing_mode = "single_day"
            trip.duration_hours = duration_hours
            trip.duration_days = None
        else:
            total_days = max(1, math.ceil(delta.total_seconds() / 86400))
            trip.timing_mode = "multi_day"
            trip.duration_days = total_days
            trip.duration_hours = None
        trip.save(update_fields=["timing_mode", "duration_hours", "duration_days"])

    for template in TripTemplate.objects.all():
        hours = template.duration_hours
        if hours is None:
            hours = 8  # assume a full-day template if unset
        if hours <= 24:
            template.timing_mode = "single_day"
            template.duration_hours = max(1, int(round(hours))) or 1
            template.duration_days = None
        else:
            template.timing_mode = "multi_day"
            template.duration_days = max(1, math.ceil(hours / 24))
            template.duration_hours = None
        template.save(update_fields=["timing_mode", "duration_hours", "duration_days"])


class Migration(migrations.Migration):

    dependencies = [
        ("trips", "0010_target_clients_per_guide"),
    ]

    operations = [
        migrations.AddField(
            model_name="trip",
            name="duration_days",
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="trip",
            name="timing_mode",
            field=models.CharField(
                choices=[("single_day", "Single day"), ("multi_day", "Multi day")],
                default="multi_day",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="triptemplate",
            name="duration_days",
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="triptemplate",
            name="timing_mode",
            field=models.CharField(
                choices=[("single_day", "Single day"), ("multi_day", "Multi day")],
                default="multi_day",
                max_length=20,
            ),
        ),
        migrations.AlterField(
            model_name="triptemplate",
            name="duration_hours",
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
        migrations.RunPython(backfill_timing_modes, migrations.RunPython.noop),
    ]
