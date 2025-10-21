from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0002_guideavailability"),
        ("availability", "0001_initial"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[],
            state_operations=[
                migrations.DeleteModel(name="GuideCalendarEvent"),
                migrations.DeleteModel(name="GuideCalendarIntegration"),
                migrations.DeleteModel(name="GuideAvailabilityShare"),
                migrations.DeleteModel(name="GuideAvailability"),
            ],
        )
    ]
