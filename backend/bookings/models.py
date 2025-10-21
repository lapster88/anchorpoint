from django.core.validators import MinValueValidator
from django.db import models
from django.utils import timezone


class GuestProfile(models.Model):
    """Represents a guest (customer) who may attend one or more trips."""

    email = models.EmailField(unique=True)
    first_name = models.CharField(max_length=120, blank=True)
    last_name = models.CharField(max_length=120, blank=True)
    phone = models.CharField(max_length=30, blank=True)
    date_of_birth = models.DateField(null=True, blank=True)
    emergency_contact_name = models.CharField(max_length=200, blank=True)
    emergency_contact_phone = models.CharField(max_length=30, blank=True)
    medical_notes = models.TextField(blank=True)
    dietary_notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["last_name", "first_name", "email"]

    def __str__(self):
        return self.full_name or self.email

    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}".strip()


class Booking(models.Model):
    """Reservation for a trip; may include multiple guests."""

    PENDING = "PENDING"
    PAID = "PAID"
    REFUNDED = "REFUNDED"
    CANCELLED = "CANCELLED"
    PAYMENT_STATUSES = [
        (PENDING, "Pending"),
        (PAID, "Paid"),
        (REFUNDED, "Refunded"),
        (CANCELLED, "Cancelled"),
    ]

    INFO_PENDING = "PENDING"
    INFO_COMPLETE = "COMPLETE"
    INFO_STATUSES = [
        (INFO_PENDING, "Pending"),
        (INFO_COMPLETE, "Complete"),
    ]

    WAIVER_PENDING = "PENDING"
    WAIVER_SIGNED = "SIGNED"
    WAIVER_STATUSES = [
        (WAIVER_PENDING, "Pending"),
        (WAIVER_SIGNED, "Signed"),
    ]

    trip = models.ForeignKey("trips.Trip", on_delete=models.CASCADE, related_name="bookings")
    primary_guest = models.ForeignKey(
        "GuestProfile",
        on_delete=models.PROTECT,
        related_name="primary_bookings",
    )
    guests = models.ManyToManyField("GuestProfile", through="BookingGuest", related_name="bookings")
    party_size = models.PositiveIntegerField(default=1, validators=[MinValueValidator(1)])
    payment_status = models.CharField(max_length=12, choices=PAYMENT_STATUSES, default=PENDING)
    info_status = models.CharField(max_length=12, choices=INFO_STATUSES, default=INFO_PENDING)
    waiver_status = models.CharField(max_length=12, choices=WAIVER_STATUSES, default=WAIVER_PENDING)
    last_guest_activity_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["trip__start", "id"]

    def __str__(self):
        return f"{self.trip.title} booking ({self.party_size})"


class BookingGuest(models.Model):
    """Join table linking bookings to every attending guest."""

    booking = models.ForeignKey("Booking", on_delete=models.CASCADE, related_name="booking_guests")
    guest = models.ForeignKey("GuestProfile", on_delete=models.CASCADE, related_name="booking_guests")
    is_primary = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("booking", "guest")

    def __str__(self):
        return f"{self.guest} × {self.booking}"


class GuestAccessToken(models.Model):
    """Magic link token that allows guests to manage bookings without a full account."""

    PURPOSE_LINK = "link"
    PURPOSE_CHOICES = [
        (PURPOSE_LINK, "General access link"),
    ]

    guest_profile = models.ForeignKey("GuestProfile", on_delete=models.CASCADE, related_name="access_tokens")
    booking = models.ForeignKey("Booking", on_delete=models.CASCADE, related_name="access_tokens", null=True, blank=True)
    token_hash = models.CharField(max_length=128, unique=True)
    purpose = models.CharField(max_length=20, choices=PURPOSE_CHOICES, default=PURPOSE_LINK)
    single_use = models.BooleanField(default=True)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def mark_used(self):
        if not self.used_at:
            self.used_at = timezone.now()
            self.save(update_fields=["used_at"])

    @property
    def is_expired(self) -> bool:
        return timezone.now() > self.expires_at or (self.single_use and self.used_at is not None)
