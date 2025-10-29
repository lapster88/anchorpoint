from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("trips", "0008_backfill_pricing_snapshot"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="trip",
            name="price_cents",
        ),
    ]
