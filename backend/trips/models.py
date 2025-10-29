from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models

from .pricing import build_single_tier_snapshot, snapshot_base_price_cents


class Trip(models.Model):
    guide_service = models.ForeignKey('orgs.GuideService', on_delete=models.CASCADE)
    title = models.CharField(max_length=200)
    location = models.CharField(max_length=200)
    start = models.DateTimeField()
    end = models.DateTimeField()
    difficulty = models.CharField(max_length=50, blank=True)
    description = models.TextField(blank=True)
    duration_hours = models.PositiveIntegerField(null=True, blank=True)
    target_clients_per_guide = models.PositiveIntegerField(null=True, blank=True)
    notes = models.TextField(blank=True)
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

    @property
    def price_cents(self) -> int:
        base = snapshot_base_price_cents(self.pricing_snapshot)
        return base or 0

    def update_single_tier_pricing(self, price_cents: int, *, currency: str | None = None):
        current = self.pricing_snapshot or {}
        snapshot = build_single_tier_snapshot(
            price_cents,
            currency=currency or current.get("currency") or "usd",
            is_deposit_required=current.get("is_deposit_required") or False,
            deposit_percent=current.get("deposit_percent") or "0",
        )
        self.pricing_snapshot = snapshot

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


class TripTemplate(models.Model):
    service = models.ForeignKey(
        'orgs.GuideService',
        on_delete=models.CASCADE,
        related_name='trip_templates',
    )
    title = models.CharField(max_length=200)
    duration_hours = models.PositiveIntegerField()
    location = models.CharField(max_length=200)
    target_clients_per_guide = models.PositiveIntegerField(null=True, blank=True)
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
    pricing_currency = models.CharField(max_length=10, default='usd')
    is_deposit_required = models.BooleanField(default=False)
    deposit_percent = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    pricing_tiers = models.JSONField(default=list)

    class Meta:
        ordering = ('title', 'id')
        unique_together = ('service', 'title')

    def __str__(self):
        return f"{self.title} ({self.service.name})"

    def to_snapshot(self):
        tiers = []
        for tier in sorted(self.pricing_tiers, key=lambda t: t.get("min_guests", 0)):
            price = tier.get("price_per_guest")
            price_cents = None
            if price is not None:
                try:
                    price_cents = int(round(float(price) * 100))
                except (TypeError, ValueError):
                    price_cents = None
            tiers.append(
                {
                    "min_guests": tier.get("min_guests"),
                    "max_guests": tier.get("max_guests"),
                    "price_per_guest": str(price) if price is not None else None,
                    "price_per_guest_cents": price_cents,
                }
            )
        return {
            "id": self.id,
            "title": self.title,
            "duration_hours": self.duration_hours,
            "location": self.location,
            "target_clients_per_guide": self.target_clients_per_guide,
            "notes": self.notes,
            "pricing": {
                "currency": self.pricing_currency,
                "is_deposit_required": self.is_deposit_required,
                "deposit_percent": str(self.deposit_percent),
                "tiers": tiers,
            },
        }
