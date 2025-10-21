from django.db import migrations, models
import django.db.models.deletion
import django.core.validators
from django.utils import timezone


def populate_guest_profiles(apps, schema_editor):
    GuestProfile = apps.get_model("bookings", "GuestProfile")
    Booking = apps.get_model("bookings", "Booking")
    BookingGuest = apps.get_model("bookings", "BookingGuest")

    db_alias = schema_editor.connection.alias

    for profile in GuestProfile.objects.using(db_alias).select_related("user"):
        user = getattr(profile, "user", None)
        if not user:
            continue
        profile.email = user.email or f"guest-{user.pk}@example.invalid"
        profile.first_name = user.first_name
        profile.last_name = user.last_name
        profile.phone = getattr(user, "phone", "")[:30]
        profile.created_at = profile.created_at or timezone.now()
        profile.updated_at = timezone.now()
        profile.save(update_fields=["email", "first_name", "last_name", "phone", "created_at", "updated_at"])

    for booking in Booking.objects.using(db_alias).select_related("guest"):
        user = getattr(booking, "guest", None)
        if not user:
            continue
        profile = GuestProfile.objects.using(db_alias).filter(email=user.email).first()
        if profile is None:
            profile = GuestProfile.objects.using(db_alias).create(
                email=user.email or f"guest-{user.pk}@example.invalid",
                first_name=user.first_name,
                last_name=user.last_name,
                phone=getattr(user, "phone", "")[:30],
                created_at=timezone.now(),
                updated_at=timezone.now(),
            )
        booking.primary_guest_id = profile.id
        booking.save(update_fields=["primary_guest"])
        BookingGuest.objects.using(db_alias).create(
            booking_id=booking.id,
            guest_id=profile.id,
            is_primary=True,
        )


def drop_old_fields(apps, schema_editor):
    """Placeholder for reversible migration."""
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("bookings", "0001_initial"),
        ("accounts", "0003_move_availability_models"),
    ]

    operations = [
        migrations.AlterModelOptions(
            name="booking",
            options={"ordering": ["trip__start", "id"]},
        ),
        migrations.AlterModelOptions(
            name="guestprofile",
            options={"ordering": ["last_name", "first_name", "email"]},
        ),
        migrations.AddField(
            model_name="guestprofile",
            name="email",
            field=models.EmailField(max_length=254, unique=True, null=True, blank=True),
        ),
        migrations.AddField(
            model_name="guestprofile",
            name="first_name",
            field=models.CharField(max_length=120, blank=True),
        ),
        migrations.AddField(
            model_name="guestprofile",
            name="last_name",
            field=models.CharField(max_length=120, blank=True),
        ),
        migrations.AddField(
            model_name="guestprofile",
            name="date_of_birth",
            field=models.DateField(null=True, blank=True),
        ),
        migrations.AddField(
            model_name="guestprofile",
            name="emergency_contact_name",
            field=models.CharField(max_length=200, blank=True),
        ),
        migrations.AddField(
            model_name="guestprofile",
            name="emergency_contact_phone",
            field=models.CharField(max_length=30, blank=True),
        ),
        migrations.AddField(
            model_name="guestprofile",
            name="medical_notes",
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name="guestprofile",
            name="dietary_notes",
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name="guestprofile",
            name="created_at",
            field=models.DateTimeField(auto_now_add=True, null=True),
        ),
        migrations.AddField(
            model_name="guestprofile",
            name="updated_at",
            field=models.DateTimeField(auto_now=True, null=True),
        ),
        migrations.AddField(
            model_name="booking",
            name="info_status",
            field=models.CharField(choices=[("PENDING", "Pending"), ("COMPLETE", "Complete")], default="PENDING", max_length=12),
        ),
        migrations.AddField(
            model_name="booking",
            name="last_guest_activity_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="booking",
            name="payment_status",
            field=models.CharField(choices=[("PENDING", "Pending"), ("PAID", "Paid"), ("REFUNDED", "Refunded"), ("CANCELLED", "Cancelled")], default="PENDING", max_length=12),
        ),
        migrations.AddField(
            model_name="booking",
            name="primary_guest",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="primary_bookings", to="bookings.guestprofile"),
        ),
        migrations.AddField(
            model_name="booking",
            name="waiver_status",
            field=models.CharField(choices=[("PENDING", "Pending"), ("SIGNED", "Signed")], default="PENDING", max_length=12),
        ),
        migrations.CreateModel(
            name="BookingGuest",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("is_primary", models.BooleanField(default=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("booking", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="booking_guests", to="bookings.booking")),
                ("guest", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="booking_guests", to="bookings.guestprofile")),
            ],
            options={"unique_together": {("booking", "guest")}},
        ),
        migrations.AddField(
            model_name="booking",
            name="guests",
            field=models.ManyToManyField(related_name="bookings", through="bookings.BookingGuest", to="bookings.guestprofile"),
        ),
        migrations.CreateModel(
            name="GuestAccessToken",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("token_hash", models.CharField(max_length=128, unique=True)),
                ("purpose", models.CharField(choices=[("link", "General access link")], default="link", max_length=20)),
                ("single_use", models.BooleanField(default=True)),
                ("expires_at", models.DateTimeField()),
                ("used_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("booking", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name="access_tokens", to="bookings.booking")),
                ("guest_profile", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="access_tokens", to="bookings.guestprofile")),
            ],
            options={"ordering": ["-created_at"]},
        ),
        migrations.RunPython(populate_guest_profiles, reverse_code=drop_old_fields),
        migrations.AlterField(
            model_name="guestprofile",
            name="email",
            field=models.EmailField(max_length=254, unique=True),
        ),
        migrations.AlterField(
            model_name="guestprofile",
            name="created_at",
            field=models.DateTimeField(auto_now_add=True),
        ),
        migrations.AlterField(
            model_name="guestprofile",
            name="updated_at",
            field=models.DateTimeField(auto_now=True),
        ),
        migrations.AlterField(
            model_name="booking",
            name="primary_guest",
            field=models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="primary_bookings", to="bookings.guestprofile"),
        ),
        migrations.RemoveField(
            model_name="booking",
            name="guest",
        ),
        migrations.RemoveField(
            model_name="guestprofile",
            name="user",
        ),
        migrations.RemoveField(
            model_name="booking",
            name="status",
        ),
        migrations.AlterField(
            model_name="booking",
            name="party_size",
            field=models.PositiveIntegerField(default=1, validators=[django.core.validators.MinValueValidator(1)]),
        ),
    ]
