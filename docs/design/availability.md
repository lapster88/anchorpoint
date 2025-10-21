# Guide Availability Design Overview

## Goals
- Centralize availability at the guide account level so one person can work for multiple services.
- Respect privacy by default: other services should only see "busy" without context unless explicitly shared.
- Automatically block time when a guide is assigned to a trip.
- Provide a foundation for syncing external calendars (Google, Outlook, etc.).

## Data Model Updates
- `availability.GuideAvailability`
  - Tracks start/end as datetimes, `is_available`, `source` (`manual`, `assignment`, `sync`).
  - Supports optional links to `GuideService` and `Trip` for richer context.
  - Adds `visibility` (`private`, `busy`, `detail`) and `note` fields.
  - Provides `effective_visibility()` helper to resolve per-service access.
- `availability.GuideAvailabilityShare`
  - Overrides default visibility for a specific `GuideService`.
- `availability.GuideCalendarIntegration`
  - Stores provider metadata and tokens for future OAuth/OIDC integrations.
- `availability.GuideCalendarEvent`
  - Mirrors external events and links them to generated availability rows.

## Automation
- Trip assignment signals create/update/delete `GuideAvailability` records with `source=assignment` and `visibility=detail` for the owning service.
- `availability.services.calendar_sync.ingest_events()` ingests external events (currently via structured payloads) and keeps availability slots synced.

## API Surface
- `GET/POST/PATCH/DELETE /api/auth/availabilities/` — guide-managed availability slots
- `POST /api/auth/availabilities/<id>/shares/` — per-service visibility overrides
- `GET /api/auth/memberships/` — exposes guide-service memberships for the UI
- `GET/POST/PATCH/DELETE /api/auth/calendar-integrations/` — external calendar links

## Frontend UX
- Profile page includes sections for manual availability entry, per-service visibility controls, and calendar integrations.
- React Query powers optimistic updates with contextual success/error messaging.

## Privacy Model
- Default visibility for new records is `busy`: other services only see that a guide is unavailable.
- Guides or operations can grant specific services more detail via `GuideAvailabilityShare` rows.
- Assignment-generated blocks carry the owning service and stay hidden from others.

## External Calendar Sync Roadmap
- `GuideCalendarIntegration` and `GuideCalendarEvent` capture the necessary metadata.
- Future work: OAuth flows per provider, background sync job invoking `ingest_events()`, and UI for linking calendars.

## Testing
- `trips/tests/test_assignments.py` verifies assignment-driven blocks.
- `availability/tests/test_availability.py` covers visibility overrides and external ingest scaffolding.
