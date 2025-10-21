from django.contrib.auth.models import AbstractUser
from django.db import models

class User(AbstractUser):
    display_name = models.CharField(max_length=120, blank=True)

class ServiceMembership(models.Model):
    OWNER='OWNER'; MANAGER='OFFICE_MANAGER'; GUIDE='GUIDE'; GUEST='GUEST'
    ROLES = [(OWNER, 'Owner'), (MANAGER, 'Office Manager'), (GUIDE, 'Guide'), (GUEST, 'Guest')]

    user = models.ForeignKey('User', on_delete=models.CASCADE)
    guide_service = models.ForeignKey('orgs.GuideService', on_delete=models.CASCADE, related_name='memberships')
    role = models.CharField(max_length=20, choices=ROLES)
    is_active = models.BooleanField(default=True)

    class Meta:
        unique_together = ('user', 'guide_service', 'role')


class GuideAvailability(models.Model):
    """Calendar window indicating whether a guide is available for assignments."""

    SOURCE_MANUAL = 'manual'
    SOURCE_ASSIGNMENT = 'assignment'
    SOURCE_SYNC = 'sync'
    SOURCE_CHOICES = [
        (SOURCE_MANUAL, 'Manual'),
        (SOURCE_ASSIGNMENT, 'Assignment'),
        (SOURCE_SYNC, 'External Sync'),
    ]

    VISIBILITY_PRIVATE = 'private'
    VISIBILITY_BUSY = 'busy'
    VISIBILITY_DETAIL = 'detail'
    VISIBILITY_CHOICES = [
        (VISIBILITY_PRIVATE, 'Private'),
        (VISIBILITY_BUSY, 'Busy Only'),
        (VISIBILITY_DETAIL, 'Show Details'),
    ]

    guide = models.ForeignKey('User', on_delete=models.CASCADE, related_name='availabilities')
    guide_service = models.ForeignKey('orgs.GuideService', null=True, blank=True, on_delete=models.CASCADE, related_name='guide_availabilities')
    trip = models.ForeignKey('trips.Trip', null=True, blank=True, on_delete=models.CASCADE, related_name='guide_availabilities')
    start = models.DateTimeField()
    end = models.DateTimeField()
    is_available = models.BooleanField(default=True)
    source = models.CharField(max_length=20, choices=SOURCE_CHOICES, default=SOURCE_MANUAL)
    visibility = models.CharField(max_length=20, choices=VISIBILITY_CHOICES, default=VISIBILITY_BUSY)
    note = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ('start',)
        verbose_name = 'Guide availability'
        verbose_name_plural = 'Guide availability'
        constraints = [
            models.UniqueConstraint(
                fields=['guide', 'trip', 'source'],
                name='unique_guide_trip_source',
                condition=models.Q(trip__isnull=False),
            ),
        ]

    def __str__(self):
        status = 'Available' if self.is_available else 'Unavailable'
        return f"{self.guide.get_full_name() or self.guide.username}: {status} {self.start:%Y-%m-%d %H:%M} → {self.end:%Y-%m-%d %H:%M}"

    def effective_visibility(self, guide_service=None):
        """
        Resolve the visibility for a consuming guide service.
        If specific override exists, use it; otherwise return default visibility.
        """
        if not guide_service:
            return self.visibility
        override = self.shares.filter(guide_service=guide_service).first()
        return override.visibility if override else self.visibility


class GuideAvailabilityShare(models.Model):
    """Per-service visibility overrides for a guide's availability slot."""

    availability = models.ForeignKey(GuideAvailability, on_delete=models.CASCADE, related_name='shares')
    guide_service = models.ForeignKey('orgs.GuideService', on_delete=models.CASCADE, related_name='availability_shares')
    visibility = models.CharField(max_length=20, choices=GuideAvailability.VISIBILITY_CHOICES, default=GuideAvailability.VISIBILITY_BUSY)

    class Meta:
        unique_together = ('availability', 'guide_service')


class GuideCalendarIntegration(models.Model):
    """Stores connection info for syncing an external calendar (Google, Outlook, etc.)."""

    PROVIDER_GOOGLE = 'google'
    PROVIDER_OUTLOOK = 'outlook'
    PROVIDER_APPLE = 'apple'
    PROVIDER_CUSTOM = 'custom'
    PROVIDER_CHOICES = [
        (PROVIDER_GOOGLE, 'Google Calendar'),
        (PROVIDER_OUTLOOK, 'Outlook / Office365'),
        (PROVIDER_APPLE, 'Apple Calendar'),
        (PROVIDER_CUSTOM, 'Custom iCal'),
    ]

    guide = models.ForeignKey('User', on_delete=models.CASCADE, related_name='calendar_integrations')
    provider = models.CharField(max_length=20, choices=PROVIDER_CHOICES)
    external_id = models.CharField(max_length=255, blank=True)
    access_token = models.TextField(blank=True)
    refresh_token = models.TextField(blank=True)
    token_expires_at = models.DateTimeField(null=True, blank=True)
    sync_config = models.JSONField(default=dict, blank=True)
    last_synced_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('guide', 'provider', 'external_id')

    def __str__(self):
        return f"{self.get_provider_display()} integration for {self.guide.get_full_name() or self.guide.username}"


class GuideCalendarEvent(models.Model):
    """Represents an external calendar event pulled into the system."""

    STATUS_BUSY = 'busy'
    STATUS_FREE = 'free'
    STATUS_CHOICES = [(STATUS_BUSY, 'Busy'), (STATUS_FREE, 'Free')]

    integration = models.ForeignKey(GuideCalendarIntegration, on_delete=models.CASCADE, related_name='events')
    uid = models.CharField(max_length=255)
    summary = models.CharField(max_length=255, blank=True)
    start = models.DateTimeField()
    end = models.DateTimeField()
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default=STATUS_BUSY)
    raw_payload = models.JSONField(default=dict, blank=True)
    last_synced_at = models.DateTimeField(null=True, blank=True)
    availability = models.OneToOneField(GuideAvailability, on_delete=models.SET_NULL, null=True, blank=True, related_name='external_event')

    class Meta:
        unique_together = ('integration', 'uid')
        ordering = ('start',)

    def __str__(self):
        return f"{self.integration.guide.get_full_name() or self.integration.guide.username}: {self.summary or 'External Event'}"
