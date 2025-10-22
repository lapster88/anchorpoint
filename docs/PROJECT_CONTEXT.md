# Anchorpoint App — Project Context

## Overview
Anchorpoint is a web platform for managing guided adventure trips. It supports multiple user roles—guide service owners, office managers, guides, and guests—enabling scheduling, booking, payments, waivers, and reporting in one streamlined interface.

The system is **Python-first**, with a Django REST Framework backend and a React frontend.

### Reference Design Docs
- `docs/design/guests.md` — guest access tokens, magic-link flows, staff visibility
- `docs/design/availability.md` — guide availability & calendar integration
- `docs/design/bookings.md` — booking workflows, notifications, staffing roadmap

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

### GuestProfile
- Canonical guest record (email, first/last name, phone, DOB, emergency + medical/dietary notes)
- Updated via guest portal magic links or staff edits
- Linked to bookings through `primary_guest` and `BookingGuest`

### Booking
- `trip` (FK) and `primary_guest` (FK to GuestProfile)
- `party_size` (covers self + additional guests)
- Statuses tracked independently: `payment_status`, `info_status`, `waiver_status`
- `last_guest_activity_at` updated when guests submit info/waivers
- Related `BookingGuest` rows link every attendee to the booking (and note the primary guest)
- Magic-link tokens issued via `GuestAccessToken`

### Payment
- Linked to a `Booking`
- `amount_cents`, `currency`, `stripe_payment_intent`, `stripe_checkout_session`, `status`, `created_at`

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
- `POST /trips/<id>/bookings/` (staff-driven booking creation)  
- `GET/POST /payments/checkout-session` (server-initiated Stripe Checkout)  
- `POST /webhooks/stripe`  
- `POST /webhooks/waivers`  
- `GET /guests/` (staff directory)
- `POST /guest-links/` (email magic links)
- `PATCH /guest-access/<token>/profile/`

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
