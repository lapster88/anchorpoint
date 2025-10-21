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
- Frontend build check: `docker compose --env-file .env -f infra/docker-compose.yml exec frontend pnpm build`.
- End-to-end baseline available via `make e2e` (boots backend/frontend, then runs Playwright container).

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
- Keep an eye on mounted volumes (`frontend/dist`, `.pnpm-store`, etc.) that appear untracked—avoid committing them.
