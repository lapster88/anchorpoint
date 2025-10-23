# Anchorpoint Agent Guidelines

## Always start with context
- Review `codex.yaml` plus `docs/PROJECT_CONTEXT.md` and the design notes relevant to the domain you touch before writing code. These outline the stack, user flows, and domain expectations that should guide any change.
- Keep the Docker-first workflow in mind—commands in `docs/CODEX_NOTES.md` describe the expected way to run servers, tests, and seeds.

## Development workflow
- Use the provided make/compose commands for local work (`make up`, `make be`, `make fe`, `make down`, `make logs`). Avoid running host binaries directly unless explicitly required.
- Keep the `.env` file aligned with `.env.example` and Docker requirements when booting the stack.
- Running `docker compose --env-file .env -f infra/docker-compose.yml exec backend python manage.py devseed` resets seed users and passwords when you need fixture data.

## Coding standards
- Backend (Django): follow the comment guidance from `codex.yaml`—prefer concise docstrings on views, serializers, and complex helpers describing intent and side effects.
- Frontend (React/TypeScript): document complex hooks or memoised logic with JSDoc or targeted inline comments, mirroring the guidelines in `codex.yaml`.
- When touching guest, booking, or availability flows, consult the corresponding design docs under `docs/design/` to confirm business rules before implementing changes.

## Testing expectations
- Every feature or bug fix must include automated test coverage in the layer you change.
  - Backend: add or update pytest coverage alongside the app under test (e.g., `accounts/tests`, `trips/tests`). Run `docker compose --env-file .env -f infra/docker-compose.yml exec backend pytest`.
  - Frontend: update or add pnpm-based tests and ensure `docker compose --env-file .env -f infra/docker-compose.yml exec frontend pnpm test` passes. Run `pnpm build` in the container for build validation when modifying UI or client logic.
  - End-to-end coverage lives behind `make e2e`; run it when changes cross backend/frontend boundaries.

## Source control hygiene
- Do not commit generated artefacts, mounted Docker volumes, or environment files. Ensure lockfiles stay in sync by installing dependencies through the appropriate container (`pip` in backend, `pnpm` in frontend).
- Before committing, verify formatting and linting using the configured tools (`ruff`, `black`, `isort`, `eslint`, `prettier`) if your changes affect their domains.
