from django.contrib import admin
from .models import Trip, Assignment, PricingModel, PricingTier, TripTemplate

admin.site.register((Trip, Assignment, PricingModel, PricingTier, TripTemplate))
