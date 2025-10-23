# Codex Session Notes

## Environment & Tooling
- Development runs fully inside Docker Compose (`infra/docker-compose.yml`). Use `make up` to build/start services and `make down` to stop and prune volumes.
- Prefer the provided make targets for shells: `make be` (backend bash) and `make fe` (frontend sh). Both mount the local code into the container.
- Frontend uses `pnpm` via the container runtime. Run install/build commands as `docker compose --env-file .env -f infra/docker-compose.yml exec frontend pnpm …`.
- Backend management commands/tests should run inside the backend container: `docker compose --env-file .env -f infra/docker-compose.yml exec backend python manage.py …` / `pytest`.
- Keep `.env` in sync with Docker expectations (Postgres credentials, JWT secrets) before running services.

## Backend Snapshot
- Django 5 + DRF located in `backend/`; custom user model at `accounts`. JWT auth via `djangorestframework-simplejwt`.
- Postgres 16 and Redis 7 provisioned by Docker; settings rely on env vars read via `django-environ`.
- Key APIs registered in `backend/config/urls.py` – trips, guide availability, calendar integrations, auth endpoints.
- Signals in `backend/trips/signals.py` keep availability in sync with trip assignments.

## Frontend Snapshot
- React 18 + TypeScript + Vite housed in `frontend/`. State/query handled by `@tanstack/react-query`.
- Authentication context (`src/lib/auth.tsx`) stores JWTs locally and auto-refreshes via `/api/auth/refresh/`.
- Use `pnpm dev -- --host` for local dev (already codified in the Docker command) and `pnpm build` for CI parity.

## Testing & QA
- Backend tests: `docker compose --env-file .env -f infra/docker-compose.yml exec backend pytest`.
- Frontend unit tests (with coverage): `docker compose --env-file .env -f infra/docker-compose.yml exec frontend pnpm test`. Vitest writes HTML/LCOV reports to `frontend/coverage/`.
- Frontend build check: `docker compose --env-file .env -f infra/docker-compose.yml exec frontend pnpm build`.
- End-to-end baseline available via `make e2e` (boots backend/frontend, then runs Playwright container).
- Booking flow smoke test lives at `frontend/e2e/booking.spec.ts` — run with `docker compose exec playwright pnpm test:e2e booking.spec.ts` after seeding data.
- Policy: Every new feature or regression fix must land with automated test coverage (backend pytest, frontend unit, or e2e as appropriate). Update or add tests before marking work complete.
- Guest workflows use tokenised magic links; see `docs/design/guests.md` before changing bookings or guest data flow.
- Trip party/payment/email architecture is summarised in `docs/PROJECT_CONTEXT.md` with detail in `docs/design/parties.md`.

## Sample Accounts
- Superuser: `admin@summitguides.test` / `AdminAnchorpoint123!`
- Summit Guides owner: `owner@summitguides.test` / `Anchorpoint123!`
- Summit Guides manager: `manager@summitguides.test` / `Anchorpoint123!`
- Primary guide: `guide@summitguides.test` / `Anchorpoint123!`
- Flex guide (members both services): `flex@summitguides.test` / `Anchorpoint123!`
- Guest: `guest@example.test` / `Anchorpoint123!`
- Running `docker compose --env-file .env -f infra/docker-compose.yml exec backend python manage.py devseed`
  will reset these accounts/passwords.

## Reminders for Future Sessions
- Always review `codex.yaml` and `docs/PROJECT_CONTEXT.md` before coding to confirm stack assumptions.
- Confirm whether commands should run on host vs. Docker container; prefer containerized workflows unless explicitly told otherwise.
- When adding dependencies, install them through the appropriate container (`frontend` for pnpm, `backend` for pip) to keep lockfiles consistent.
- Frontend work should include inline comments for complex hooks/memoised logic—do a quick pass before committing to ensure the intent is documented (see `codex.yaml` comment guidelines).
- Backend tests now live alongside their apps (`accounts/tests`, `trips/tests`, etc.); place new coverage next to the feature under test.
- Keep an eye on mounted volumes (`frontend/dist`, `.pnpm-store`, etc.) that appear untracked—avoid committing them.
- Maintain this notes file as the condensed conversation record; update it whenever context grows so future sessions can reload quickly without scrolling old transcripts.

## Recent Decisions & Guidelines
- **Calendar & Availability**: Guides are assumed available by default. Unavailability blocks are created/edited directly on the calendar via drag-to-select, and removing a block restores availability. Warn on overlaps and allow a “don’t show again” dismissal. Availability logic now lives in the dedicated `availability` app.
- **Testing Policy**: Every new feature (frontend or backend) must land with automated coverage; add Vitest/Playwright specs for React features and pytest for Django changes. Validate coverage before handing off work.
- **Frontend Comments**: Leaving thoughtful inline comments around non-obvious hooks, async flows, and memoized selectors is now part of the definition of done—review new TSX before commit.
- **Parties & Guests**: Central requirements live in `docs/design/parties.md` (staff workflow first, guest tokens, Stripe integration stubs, future email provider support). Keep staff creation flow Stripe-ready via stubbed services so real keys only swap in at deploy time.
- **Trip Parties UI**: Staff manage parties directly from the trip card. The first party is created alongside the trip; use the Advanced toggle to add secondary parties when separate groups need to pay or manage info independently.
- **Active Service Context**: The app header now displays the current guide service (or "Multiple services" for guides). Staff trip creation infers the active service automatically; guides can still see service labels on trip and calendar views when juggling multiple services.
- **Guide Assignment Editing**: Owners/managers can reassign the lead guide inside the trip management panel; guides see a read-only summary of their trips.
- **Stripe & Notifications**: Implement payment intents through stub interfaces that can switch to live Stripe later. Email sending should support per-guide-service identities (e.g., “XYZ Guides via Anchorpoint”) and remain pluggable for future providers.
- **Devseed Consistency**: `manage.py devseed` must create deterministic accounts/passwords (listed above) each run; document new fixtures here if they are added.
