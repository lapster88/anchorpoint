# Climbing Guide App — Starter

A Python-first Django + React starter for guide services (owners, office managers, guides, and guests).

## Quickstart (Docker)
```bash
cp .env.example .env
make up
make logs
```
- Backend API: http://localhost:8000
- Frontend: http://localhost:5173

## Useful Commands
```bash
make be   # shell into backend container
make fe   # shell into frontend container
make down # stop and remove volumes
```

## Local (without Docker)
```bash
# Backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver

# Frontend
cd ../frontend
npm i
npm run dev -- --host
```

## Next Steps
1. Configure JWT auth endpoints (register/login/refresh).
2. Implement service-scoped permissions and per-role dashboards.
3. Wire Stripe Checkout + webhook for `Booking` payments.
4. Integrate waiver provider (e.g., Smartwaiver) webhooks.
5. Add seed command to populate sample data.
