# Trip Timing Modes

This document outlines how we handle scheduling metadata for trips, covering both single-day itineraries and multi-day programs. The goal is to keep the underlying data model consistent (explicit start/end datetimes) while giving staff a clear, mode-specific editing experience.

---

## Requirements

1. **Single-day trips** only need a date, start time, and duration in hours.
2. **Multi-day trips** should be captured via a start date/time and a duration in whole days (explicit end datetime is derived).
3. Staff must be able to select the mode during trip/template creation and view the appropriate input fields.
4. Existing APIs and downstream consumers should continue to rely on `start`/`end` datetimes without special casing.
5. Validation rules must prevent inconsistent combinations (e.g., single-day crossing midnight).

---

## Data Model Changes

### Trip & TripTemplate

| Field | Type | Purpose |
|-------|------|---------|
| `timing_mode` | `CharField` (choices: `SINGLE_DAY`, `MULTI_DAY`, default `MULTI_DAY`) | Specifies how the trip should be interpreted and rendered in the UI. |
| `duration_hours` | `PositiveIntegerField(null=True, blank=True)` | Used only when `timing_mode == SINGLE_DAY`; persisted for historical reference and quick summaries. |
| `duration_days` | `PositiveIntegerField(null=True, blank=True)` | Used only when `timing_mode == MULTI_DAY`; indicates how many calendar days are covered. |
| `start`, `end` | `DateTimeField` | Continue to store canonical start/end timestamps for compatibility. |

### Migrations

1. Add `timing_mode` and `duration_days` to `Trip`/`TripTemplate`.
2. Backfill existing rows:
   - If `start.date() == end.date()`, mark as `SINGLE_DAY`, compute `duration_hours` from `end - start`, set `duration_days = null`.
   - Otherwise mark `MULTI_DAY`, compute `duration_days = max(1, ceil((end - start).total_seconds() / 86400))`.
3. Drop any assumptions that `duration_hours` is always populated.

---

## Backend Logic

### Serialization & Validation

**Trip creation/update**
- Require `timing_mode`.
- When `SINGLE_DAY`:
  - Accept `date`, `start_time`, `duration_hours` in the payload (or ISO `start` plus `duration_hours`).
  - Validate `duration_hours > 0`.
  - Derive `end = start + duration_hours`.
  - Ensure `start.date() == end.date()`.
  - Null out `duration_days`.
- When `MULTI_DAY`:
  - Require `duration_days >= 1`.
  - Derive `end = start + duration_days`.
  - Null out `duration_hours`.
  - Accept optional explicit `end` for idempotence but recompute to avoid drift.

**Trip templates**
- Mirror the trip validation so templates carry `timing_mode`, `duration_hours`, `duration_days`.
- When a trip is created from a template, copy the timing mode and duration values, recomputing `end`.

### API Responses
- Always return `start`, `end`, `timing_mode`, `duration_hours`, `duration_days`.
- Consumers can render a friendly summary without re-deriving values.

---

## Frontend Implementation

### Forms

**Trip create form**
- Add a “Trip length” radio switch (Single-day vs Multi-day).
- **Single-day mode** shows:
  - Date picker (combines with start time to make `start`).
  - Start time input.
  - Duration (hours) numeric input.
  - Hidden end-time UI (the form displays a read-only preview of the derived end time).
- **Multi-day mode** shows:
  - Start date & time picker.
  - Duration (days) input.
  - Optional preview of the derived end date/time.
- Payload builder sends:
  - ISO `start`.
  - `timing_mode`.
  - Either `duration_hours` or `duration_days` as appropriate.

**Trip templates modal**
- Same toggle to capture `timing_mode`.
- Persist relevant duration field and pre-fill when editing.

### Rendering

Update trip cards, TripPartyManager headers, and any roster views:
- Single-day example: `Oct 20 · 8:00 AM · 8h`.
- Multi-day example: `Oct 20, 8:00 AM → Oct 23, 6:00 PM` plus a badge like “3-day itinerary”.

---

## Testing Strategy

### Backend
- Extend unit tests to cover:
  - Creating both modes (manual and template-based).
  - Validation failures (missing duration, crossing midnight, negative durations).
  - Backfill migration ensures `timing_mode` and durations are set correctly for existing rows.

### Frontend
- Update RTL tests for:
  - Trip form mode switching (payload contains correct fields).
  - Template modal mode switching.
  - Display logic in list/detail views.

---

## Open Questions

1. Should duration-days accept non-integer values (e.g., 2.5 days)? Current plan uses whole days for simplicity.
2. Do guides need to view both start/end and duration simultaneously? We can revisit UI if they request additional context.
3. Should we expose read-only derived fields (e.g., `computed_duration_hours`) for analytics? Not required now but easy to add.

---

With this structure, staff workflows stay simple: pick the trip type, fill in minimal fields, and the system stores normalized timestamps for downstream systems. The UI messaging emphasizes “target” durations so guides understand these values are planning aids, not hard constraints.
