from django.db import models
from django.conf import settings

class GuestProfile(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='guest_profile')
    phone = models.CharField(max_length=30, blank=True)

class Booking(models.Model):
    PENDING='PENDING'; PAID='PAID'; CANCELLED='CANCELLED'
    STATUSES=[(PENDING,'Pending'),(PAID,'Paid'),(CANCELLED,'Cancelled')]

    trip = models.ForeignKey('trips.Trip', on_delete=models.CASCADE, related_name='bookings')
    guest = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    party_size = models.PositiveIntegerField(default=1)
    status = models.CharField(max_length=12, choices=STATUSES, default=PENDING)
    created_at = models.DateTimeField(auto_now_add=True)
