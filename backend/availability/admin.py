from django.contrib import admin

from .models import (
    GuideAvailability,
    GuideAvailabilityShare,
    GuideCalendarIntegration,
    GuideCalendarEvent,
)

admin.site.register(
    (
        GuideAvailability,
        GuideAvailabilityShare,
        GuideCalendarIntegration,
        GuideCalendarEvent,
    )
)
