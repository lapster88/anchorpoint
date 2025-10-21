# Anchorpoint App — Project Context

## Overview
Anchorpoint is a web platform for managing guided adventure trips. It supports multiple user roles—guide service owners, office managers, guides, and guests—enabling scheduling, booking, payments, waivers, and reporting in one streamlined interface.

The system is **Python-first**, with a Django REST Framework backend and a React frontend.

---

## Tech Stack

### Backend
- **Django 5** + **Django REST Framework**
- **PostgreSQL 16** (managed: **Supabase** or **Neon**)
- **JWT Authentication** via `djangorestframework-simplejwt`
- `django-filter`, `django-cors-headers`
- Optional: **Celery + Redis** for async tasks (emails, reports)
- **Stripe** for payments (Checkout + webhooks)
- **Smartwaiver** (or SignWell) for waivers (webhooks + stored URLs)
- S3-compatible storage (AWS S3 / Cloudflare R2 / Supabase Storage)

### Frontend
- **React 18** + **TypeScript** + **Vite**
- **TailwindCSS** + **shadcn/ui** + **lucide-react**
- **React Query** + **Axios**
- **React Hook Form** + **Zod**
- **React Router** for routing

### DevOps
- **Docker Compose** for local development
- **GitHub Actions** for CI (lint, test, build)
- Pre-commit hooks: ruff, black, isort, mypy, eslint, prettier
- Deployment: Backend (Fly.io/Render/Heroku), Frontend (Vercel/Netlify)
- Domain + HTTPS via Cloudflare
- Code comments & documentation
  - Add succinct docstrings for Django views/serializers when behaviour is non-trivial
  - In TypeScript/React, prefer JSDoc or short inline comments for context-heavy hooks/components
  - Focus comments on intent, side-effects, or data flow rather than restating code
- Authentication roadmap
  - Current stack relies on JWT via `djangorestframework-simplejwt`
  - Future enhancement: introduce OAuth/OIDC (e.g., Auth0, Okta, or Azure AD) for SSO and federated login

---

## Monorepo Structure

    anchorpoint/
      backend/
        config/            # Django project (settings/urls/wsgi)
        accounts/          # custom User + service membership + guide availability
        orgs/              # GuideService model
        trips/             # Trip, Assignment
        bookings/          # Booking, GuestProfile
        payments/          # Payment (Stripe)
        waivers/           # Waiver metadata
        reports/           # TripReport
        manage.py
        requirements.txt
      frontend/
        src/
          app/
          features/
          lib/
        index.html
        package.json
        vite.config.ts
        tailwind.config.js
        tsconfig.json
      infra/
        docker-compose.yml
        Dockerfile.backend
        Dockerfile.frontend
      docs/
      .env.example
      Makefile
      README.md

---

## Core Domain Model

### GuideService
Represents a guiding business (multi-tenant anchor).
- `name`, `slug`, `contact_email`, `phone`, `billing_stripe_account`

### User & ServiceMembership
Users can belong to multiple guide services with different roles.
- Roles: `OWNER`, `OFFICE_MANAGER`, `GUIDE`, `GUEST`
- `ServiceMembership` keys: `(user, guide_service, role)` unique

### Trip
- `guide_service` (FK)
- `title`, `location`, `start`, `end`, `capacity`, `price_cents`, `difficulty`, `description`

### Assignment
- Link between **Trip** and **User** (guide)
- `role`: `LEAD` or `ASSIST`

### GuideAvailability
- For a **guide**, date-range availability record
- `guide` (FK to User), `guide_service` (optional FK), `trip` (optional FK), `start`, `end`, `is_available: bool`
- `source` indicates whether the record was created manually, via assignment, or external sync
- `visibility` defaults to `busy` (other services see busy/free only); `GuideAvailabilityShare` rows allow per-service overrides
- External calendar integrations (`GuideCalendarIntegration`, `GuideCalendarEvent`) convert synced events into availability slots

### Booking
- `trip` (FK), `guest` (FK to User)
- `party_size`, `status` in `{PENDING, PAID, CANCELLED}`
- `created_at`

### Payment
- Linked to a `Booking`
- `amount_cents`, `currency`, `stripe_payment_intent`, `status`, `created_at`

### Waiver
- One-to-one with `Booking`
- `provider`, `signed_at`, `url`, `external_id`

### TripReport
- Linked to `Trip`, authored by `User`
- `summary`, `conditions`, `incidents`, `submitted_at`

---

## Permissions Matrix (MVP)

| Capability                        | Owner | Office Mgr | Guide | Guest |
|----------------------------------|:----:|:----------:|:----:|:----:|
| CRUD GuideService                |  ✓   |            |      |      |
| Manage Trips                     |  ✓   |     ✓      |      |      |
| Assign Guides                    |  ✓   |     ✓      |      |      |
| View My Assignments              |      |            |  ✓   |      |
| View My Bookings                 |      |            |      |  ✓   |
| Create Booking                   |      |     ✓      |      |  ✓   |
| Take Payment                     |      |     ✓      |      |      |
| See Guest Info (their trips)     |  ✓   |     ✓      |  ✓   |      |
| Submit Trip Report               |      |            |  ✓   |      |
| Export Reports                   |  ✓   |     ✓      |      |      |

---

## Key Flows

### Guest Booking
1. Guest browses trips  
2. Creates booking → **Stripe Checkout**  
3. Webhook sets `Booking.status = PAID` on `payment_intent.succeeded`  
4. Guest receives **waiver link**, signs; webhook sets `Waiver.signed_at`  
5. Booking is confirmed (paid + waiver signed)

### Guide Workflow
- Views assigned trips and guest details
- Submits **TripReport** post-trip (conditions/incidents)

### Office Manager
- Books guests manually (phone/email bookings)
- Manages scheduling & guide assignments
- Reconciles payments and generates CSV/Excel reports

### Owner
- Monitors revenue, utilization, upcoming capacity
- Exports monthly/annual reports

---

## API Surface (MVP)

- `POST /auth/register` — create user  
- `POST /auth/login` — obtain JWT (access/refresh)  
- `POST /auth/refresh` — refresh token  

- `GET/POST/PATCH /trips/`  
- `GET/POST/PATCH /bookings/`  
- `GET/POST /payments/checkout-session` (server-initiated Stripe Checkout)  
- `POST /webhooks/stripe`  
- `POST /webhooks/waivers`  

---

## Frontend (MVP Pages)

- **Public**: Home (trips list), Trip detail, Booking flow, Payment success/cancel, Waiver link  
- **Auth**: Login/Register  
- **Dashboards**:  
  - Owner/Manager: Trip schedule, Bookings table, Assignments, Reports export  
  - Guide: My assignments, Trip details, Submit TripReport  
  - Guest: My bookings, Payment/waiver status  

State management:
- React Query for server state
- JWT stored in httpOnly cookie (preferred) or Bearer header

---

## Configuration & Env

    DJANGO_SECRET_KEY=change-me
    POSTGRES_DB=cg
    POSTGRES_USER=cg
    POSTGRES_PASSWORD=cg
    POSTGRES_HOST=postgres
    POSTGRES_PORT=5432
    ALLOWED_HOSTS=*
    CORS_ALLOWED_ORIGINS=http://localhost:5173
    DJANGO_DEBUG=1
    STRIPE_SECRET_KEY=sk_test_xxx
    STRIPE_WEBHOOK_SECRET=whsec_xxx
    WAIVER_PROVIDER=smartwaiver
    S3_BUCKET=cg-dev
    S3_REGION=us-west-2
    S3_ACCESS_KEY_ID=xxx
    S3_SECRET_ACCESS_KEY=xxx

---

## Milestones

1. Auth: Implement JWT register/login/refresh  
2. Role-based access control  
3. Stripe Checkout + webhook integration  
4. Waiver provider webhook  
5. Dashboard pages  
6. CSV/Excel reporting  
7. Seed data command  

---

## Quality & Deployment

- Lint/format: ruff, black, isort, mypy; eslint, prettier  
- Tests: pytest + DRF; React Testing Library  
- Logging: Sentry  
- CI: GitHub Actions  
- Deployment:  
  - DB: Neon / Supabase Postgres  
  - Backend: Fly.io / Render / Heroku (Docker)  
  - Frontend: Vercel / Netlify  
  - HTTPS + domain: Cloudflare  
