from django.db import models

class GuideService(models.Model):
    name = models.CharField(max_length=200)
    slug = models.SlugField(unique=True)
    contact_email = models.EmailField()
    phone = models.CharField(max_length=30, blank=True)
    billing_stripe_account = models.CharField(max_length=200, blank=True)

    def __str__(self):
        return self.name
