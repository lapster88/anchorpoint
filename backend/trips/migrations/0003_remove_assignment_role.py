from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("trips", "0002_delete_availability"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="assignment",
            name="role",
        ),
    ]
