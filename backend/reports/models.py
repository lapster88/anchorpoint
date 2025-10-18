from django.db import models
from django.conf import settings

class TripReport(models.Model):
    trip = models.ForeignKey('trips.Trip', on_delete=models.CASCADE, related_name='reports')
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    submitted_at = models.DateTimeField(auto_now_add=True)
    summary = models.TextField()
    conditions = models.TextField(blank=True)
    incidents = models.TextField(blank=True)
