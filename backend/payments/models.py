from django.db import models

class Payment(models.Model):
    booking = models.ForeignKey('bookings.Booking', on_delete=models.CASCADE, related_name='payments')
    amount_cents = models.PositiveIntegerField()
    currency = models.CharField(max_length=10, default='usd')
    stripe_payment_intent = models.CharField(max_length=200)
    status = models.CharField(max_length=30)
    created_at = models.DateTimeField(auto_now_add=True)
