from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models


class Trip(models.Model):
    guide_service = models.ForeignKey('orgs.GuideService', on_delete=models.CASCADE)
    title = models.CharField(max_length=200)
    location = models.CharField(max_length=200)
    start = models.DateTimeField()
    end = models.DateTimeField()
    price_cents = models.PositiveIntegerField()
    difficulty = models.CharField(max_length=50, blank=True)
    description = models.TextField(blank=True)
    duration_hours = models.PositiveIntegerField(null=True, blank=True)
    target_client_count = models.PositiveIntegerField(null=True, blank=True)
    target_guide_count = models.PositiveIntegerField(null=True, blank=True)
    notes = models.TextField(blank=True)
    pricing_model = models.ForeignKey(
        'trips.PricingModel',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='trips',
    )
    pricing_snapshot = models.JSONField(blank=True, null=True)
    template_used = models.ForeignKey(
        'trips.TripTemplate',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='trips',
    )
    template_snapshot = models.JSONField(blank=True, null=True)

    def __str__(self):
        return f"{self.title} @ {self.location}"

    def clean(self):
        super().clean()
        if self.start and self.end and self.end <= self.start:
            raise ValidationError({"end": "End time must be after the start time."})

    def save(self, *args, **kwargs):
        self.full_clean()
        return super().save(*args, **kwargs)

class Assignment(models.Model):
    trip = models.ForeignKey(
        Trip, on_delete=models.CASCADE, related_name="assignments"
    )
    guide = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)

    def __str__(self):
        return f"{self.trip.title} → {self.guide.get_full_name() or self.guide.email}"


class PricingModel(models.Model):
    DEFAULT_CURRENCY = 'usd'

    service = models.ForeignKey(
        'orgs.GuideService',
        on_delete=models.CASCADE,
        related_name='pricing_models'
    )
    name = models.CharField(max_length=120)
    description = models.TextField(blank=True)
    default_location = models.CharField(max_length=200, blank=True)
    currency = models.CharField(max_length=10, default=DEFAULT_CURRENCY)
    is_deposit_required = models.BooleanField(default=False)
    deposit_percent = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_pricing_models'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ('name', 'id')

    def __str__(self):
        return f"{self.name} ({self.service.name})"

    def to_snapshot(self):
        tiers = [
            tier.to_snapshot()
            for tier in self.tiers.order_by('min_guests')
        ]
        return {
            "pricing_model_id": self.id,
            "pricing_model_name": self.name,
            "currency": self.currency,
            "is_deposit_required": self.is_deposit_required,
            "deposit_percent": str(self.deposit_percent),
            "tiers": tiers,
        }


class PricingTier(models.Model):
    model = models.ForeignKey(
        PricingModel,
        on_delete=models.CASCADE,
        related_name='tiers'
    )
    min_guests = models.PositiveIntegerField()
    max_guests = models.PositiveIntegerField(blank=True, null=True)
    price_per_guest = models.DecimalField(max_digits=8, decimal_places=2)

    class Meta:
        ordering = ('min_guests',)
        unique_together = ('model', 'min_guests')

    def __str__(self):
        if self.max_guests is None:
            return f"{self.model.name}: {self.min_guests}+ guests"
        return f"{self.model.name}: {self.min_guests}-{self.max_guests} guests"

    def to_snapshot(self):
        price = Decimal(self.price_per_guest)
        cents = int((price * 100).quantize(Decimal("1")))
        return {
            "id": self.id,
            "min_guests": self.min_guests,
            "max_guests": self.max_guests,
            "price_per_guest": str(self.price_per_guest),
            "price_per_guest_cents": cents,
        }


class TripTemplate(models.Model):
    service = models.ForeignKey(
        'orgs.GuideService',
        on_delete=models.CASCADE,
        related_name='trip_templates',
    )
    title = models.CharField(max_length=200)
    duration_hours = models.PositiveIntegerField()
    location = models.CharField(max_length=200)
    pricing_model = models.ForeignKey(
        'trips.PricingModel',
        on_delete=models.PROTECT,
        related_name='trip_templates',
    )
    target_client_count = models.PositiveIntegerField(default=1)
    target_guide_count = models.PositiveIntegerField(default=1)
    notes = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_trip_templates',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ('title', 'id')
        unique_together = ('service', 'title')

    def __str__(self):
        return f"{self.title} ({self.service.name})"

    def to_snapshot(self):
        return {
            "id": self.id,
            "title": self.title,
            "duration_hours": self.duration_hours,
            "location": self.location,
            "target_client_count": self.target_client_count,
            "target_guide_count": self.target_guide_count,
            "notes": self.notes,
        }
