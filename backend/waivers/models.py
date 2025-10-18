from django.db import models

class Waiver(models.Model):
    booking = models.OneToOneField('bookings.Booking', on_delete=models.CASCADE, related_name='waiver')
    provider = models.CharField(max_length=50)
    signed_at = models.DateTimeField(null=True, blank=True)
    url = models.URLField(blank=True)
    external_id = models.CharField(max_length=100, blank=True)
