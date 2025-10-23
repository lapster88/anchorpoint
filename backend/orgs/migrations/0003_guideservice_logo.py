from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("orgs", "0002_servicestripeaccount"),
    ]

    operations = [
        migrations.AddField(
            model_name="guideservice",
            name="logo",
            field=models.ImageField(blank=True, null=True, upload_to="guide-logos/"),
        ),
    ]
