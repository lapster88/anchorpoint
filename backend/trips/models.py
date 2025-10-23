from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models

class Trip(models.Model):
    guide_service = models.ForeignKey('orgs.GuideService', on_delete=models.CASCADE)
    title = models.CharField(max_length=200)
    location = models.CharField(max_length=200)
    start = models.DateTimeField()
    end = models.DateTimeField()
    capacity = models.PositiveIntegerField(default=1)
    price_cents = models.PositiveIntegerField()
    difficulty = models.CharField(max_length=50, blank=True)
    description = models.TextField(blank=True)

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
