from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("orgs", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="ServiceStripeAccount",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("account_id", models.CharField(max_length=255, unique=True)),
                ("access_token", models.CharField(blank=True, max_length=255)),
                ("refresh_token", models.CharField(blank=True, max_length=255)),
                ("publishable_key", models.CharField(blank=True, max_length=255)),
                ("scope", models.CharField(blank=True, max_length=80)),
                ("token_type", models.CharField(blank=True, max_length=50)),
                ("livemode", models.BooleanField(default=False)),
                ("charges_enabled", models.BooleanField(default=False)),
                ("payouts_enabled", models.BooleanField(default=False)),
                ("details_submitted", models.BooleanField(default=False)),
                ("default_currency", models.CharField(blank=True, max_length=10)),
                ("account_email", models.EmailField(blank=True, max_length=254)),
                ("express_dashboard_url", models.URLField(blank=True)),
                ("onboarding_link_url", models.URLField(blank=True)),
                ("onboarding_expires_at", models.DateTimeField(blank=True, null=True)),
                (
                    "last_webhook_received_at",
                    models.DateTimeField(blank=True, null=True),
                ),
                ("last_webhook_error_at", models.DateTimeField(blank=True, null=True)),
                (
                    "last_webhook_error_message",
                    models.CharField(blank=True, max_length=500),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "created_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="created_stripe_accounts",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "guide_service",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="stripe_account",
                        to="orgs.guideservice",
                    ),
                ),
            ],
        ),
    ]
