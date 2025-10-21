from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        ("accounts", "0002_guideavailability"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[],
            state_operations=[
                migrations.CreateModel(
                    name="GuideAvailability",
                    fields=[
                        ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                        ("start", models.DateTimeField()),
                        ("end", models.DateTimeField()),
                        ("is_available", models.BooleanField(default=True)),
                        ("source", models.CharField(choices=[("manual", "Manual"), ("assignment", "Assignment"), ("sync", "External Sync")], default="manual", max_length=20)),
                        ("visibility", models.CharField(choices=[("private", "Private"), ("busy", "Busy Only"), ("detail", "Show Details")], default="busy", max_length=20)),
                        ("note", models.CharField(blank=True, max_length=255)),
                        ("created_at", models.DateTimeField(auto_now_add=True)),
                        ("updated_at", models.DateTimeField(auto_now=True)),
                        ("guide", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="availabilities", to=settings.AUTH_USER_MODEL)),
                        ("guide_service", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name="guide_availabilities", to="orgs.guideservice")),
                        ("trip", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name="guide_availabilities", to="trips.trip")),
                    ],
                    options={
                        "ordering": ("start",),
                        "verbose_name": "Guide availability",
                        "verbose_name_plural": "Guide availability",
                        "db_table": "accounts_guideavailability",
                    },
                ),
                migrations.CreateModel(
                    name="GuideAvailabilityShare",
                    fields=[
                        ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                        ("visibility", models.CharField(choices=[("private", "Private"), ("busy", "Busy Only"), ("detail", "Show Details")], default="busy", max_length=20)),
                        ("availability", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="shares", to="availability.guideavailability")),
                        ("guide_service", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="availability_shares", to="orgs.guideservice")),
                    ],
                    options={
                        "db_table": "accounts_guideavailabilityshare",
                    },
                ),
                migrations.CreateModel(
                    name="GuideCalendarIntegration",
                    fields=[
                        ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                        ("provider", models.CharField(choices=[("google", "Google Calendar"), ("outlook", "Outlook / Office365"), ("apple", "Apple Calendar"), ("custom", "Custom iCal")], max_length=20)),
                        ("external_id", models.CharField(blank=True, max_length=255)),
                        ("access_token", models.TextField(blank=True)),
                        ("refresh_token", models.TextField(blank=True)),
                        ("token_expires_at", models.DateTimeField(blank=True, null=True)),
                        ("sync_config", models.JSONField(blank=True, default=dict)),
                        ("last_synced_at", models.DateTimeField(blank=True, null=True)),
                        ("is_active", models.BooleanField(default=True)),
                        ("created_at", models.DateTimeField(auto_now_add=True)),
                        ("updated_at", models.DateTimeField(auto_now=True)),
                        ("guide", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="calendar_integrations", to=settings.AUTH_USER_MODEL)),
                    ],
                    options={
                        "db_table": "accounts_guidecalendarintegration",
                    },
                ),
                migrations.CreateModel(
                    name="GuideCalendarEvent",
                    fields=[
                        ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                        ("uid", models.CharField(max_length=255)),
                        ("summary", models.CharField(blank=True, max_length=255)),
                        ("start", models.DateTimeField()),
                        ("end", models.DateTimeField()),
                        ("status", models.CharField(choices=[("busy", "Busy"), ("free", "Free")], default="busy", max_length=10)),
                        ("raw_payload", models.JSONField(blank=True, default=dict)),
                        ("last_synced_at", models.DateTimeField(blank=True, null=True)),
                        ("availability", models.OneToOneField(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="external_event", to="availability.guideavailability")),
                        ("integration", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="events", to="availability.guidecalendarintegration")),
                    ],
                    options={
                        "ordering": ("start",),
                        "db_table": "accounts_guidecalendarevent",
                    },
                ),
                migrations.AddConstraint(
                    model_name="guideavailability",
                    constraint=models.UniqueConstraint(condition=models.Q(trip__isnull=False), fields=("guide", "trip", "source"), name="unique_guide_trip_source"),
                ),
                migrations.AlterUniqueTogether(
                    name="guideavailabilityshare",
                    unique_together={("availability", "guide_service")},
                ),
                migrations.AlterUniqueTogether(
                    name="guidecalendarintegration",
                    unique_together={("guide", "provider", "external_id")},
                ),
                migrations.AlterUniqueTogether(
                    name="guidecalendarevent",
                    unique_together={("integration", "uid")},
                ),
            ],
        )
    ]
