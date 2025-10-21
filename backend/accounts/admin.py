from django.contrib import admin
from .models import (
    User,
    ServiceMembership,
    GuideAvailability,
    GuideAvailabilityShare,
    GuideCalendarIntegration,
    GuideCalendarEvent,
)

admin.site.register((
    User,
    ServiceMembership,
    GuideAvailability,
    GuideAvailabilityShare,
    GuideCalendarIntegration,
    GuideCalendarEvent,
))
