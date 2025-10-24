from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("orgs", "0003_guideservice_logo"),
        ("trips", "0003_remove_assignment_role"),
    ]

    operations = [
        migrations.CreateModel(
            name="PricingModel",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=120)),
                ("description", models.TextField(blank=True)),
                ("default_location", models.CharField(blank=True, max_length=200)),
                ("currency", models.CharField(default="usd", max_length=10)),
                ("is_deposit_required", models.BooleanField(default=False)),
                ("deposit_percent", models.DecimalField(decimal_places=2, default=0, max_digits=5)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("created_by", models.ForeignKey(blank=True, null=True, on_delete=models.SET_NULL, related_name="created_pricing_models", to=settings.AUTH_USER_MODEL)),
                ("service", models.ForeignKey(on_delete=models.CASCADE, related_name="pricing_models", to="orgs.guideservice")),
            ],
        ),
        migrations.CreateModel(
            name="PricingTier",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("min_guests", models.PositiveIntegerField()),
                ("max_guests", models.PositiveIntegerField(blank=True, null=True)),
                ("price_per_guest", models.DecimalField(decimal_places=2, max_digits=8)),
                ("model", models.ForeignKey(on_delete=models.CASCADE, related_name="tiers", to="trips.pricingmodel")),
            ],
        ),
        migrations.AlterUniqueTogether(
            name="pricingtier",
            unique_together={("model", "min_guests")},
        ),
    ]
