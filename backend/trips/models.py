from django.db import models
from django.conf import settings

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

class Assignment(models.Model):
    LEAD='LEAD'; ASSIST='ASSIST'
    ROLES=[(LEAD,'Lead'),(ASSIST,'Assistant')]
    trip = models.ForeignKey(Trip, on_delete=models.CASCADE, related_name='assignments')
    guide = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    role = models.CharField(max_length=10, choices=ROLES)

class Availability(models.Model):
    guide = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    start = models.DateField(); end = models.DateField()
    available = models.BooleanField(default=True)
