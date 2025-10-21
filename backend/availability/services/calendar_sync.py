from dataclasses import dataclass
from typing import Iterable

from django.utils import timezone

from availability.models import (
    GuideAvailability,
    GuideCalendarEvent,
    GuideCalendarIntegration,
)


@dataclass
class ExternalEvent:
    uid: str
    start: timezone.datetime
    end: timezone.datetime
    summary: str | None = None
    status: str = GuideCalendarEvent.STATUS_BUSY
    payload: dict | None = None


def ingest_events(integration: GuideCalendarIntegration, events: Iterable[ExternalEvent]):
    """Persist external events and mirror them into guide availability slots."""
    seen_uids: set[str] = set()

    for event in events:
        seen_uids.add(event.uid)
        calendar_event, _ = GuideCalendarEvent.objects.update_or_create(
            integration=integration,
            uid=event.uid,
            defaults={
                'summary': event.summary or '',
                'start': event.start,
                'end': event.end,
                'status': event.status,
                'raw_payload': event.payload or {},
                'last_synced_at': timezone.now(),
            },
        )

        busy = event.status != GuideCalendarEvent.STATUS_FREE
        availability = calendar_event.availability
        if availability is None:
            availability = GuideAvailability.objects.create(
                guide=integration.guide,
                guide_service=None,
                trip=None,
                start=event.start,
                end=event.end,
                is_available=not busy,
                visibility=GuideAvailability.VISIBILITY_BUSY,
                source=GuideAvailability.SOURCE_SYNC,
                note=event.summary or '',
            )
            calendar_event.availability = availability
            calendar_event.save(update_fields=['availability'])
        else:
            availability.start = event.start
            availability.end = event.end
            availability.is_available = not busy
            availability.note = event.summary or ''
            availability.save(update_fields=['start', 'end', 'is_available', 'note', 'updated_at'])

    stale_events = integration.events.exclude(uid__in=seen_uids)
    for stale in stale_events:
        availability = stale.availability
        if availability and availability.source == GuideAvailability.SOURCE_SYNC:
            availability.delete()
        stale.delete()
    integration.last_synced_at = timezone.now()
    integration.save(update_fields=['last_synced_at'])
