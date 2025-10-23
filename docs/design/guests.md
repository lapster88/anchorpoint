# Guest Experience & Data Model Design

## Goals

- Allow trip guests to complete all required tasks (payment, info collection, waivers) without maintaining a traditional application account.
- Keep guide service staff informed about guest status (payment, waivers, previous trips) to streamline trip operations.
- Provide a secure, low-friction way for guests to revisit their trip resources and update details as needed.

---

## Guest Lifecycle Overview

1. **Booking Initiation**
   - Public booking flow captures an email + basic contact details.
   - A `GuestProfile` is created (or reused if the email already exists) and linked to the `Booking`.
   - A short-lived "guest access token" is generated and emailed with next steps.

2. **Post-Booking Actions (via magic links)**
   - **Payment**: guest is redirected to a pre-configured Stripe Checkout session or payment page.
   - **Trip Details**: guest completes profile fields (dietary needs, emergency contact, etc.) through a token-authenticated form.
   - **Waivers**: guest is sent to the waiver provider (or an embedded signing flow) using the same token as proof of identity.

3. **Ongoing Access**
   - Each magic link can be single-use or exchangeable for a longer-lived session token (expiring after X days).
   - Guests can request a fresh link by supplying their email and booking reference; send a new token via email.

4. **Trip Completion**
   - When a trip ends, bookings and guest history remain visible to staff for future reference.
   - Guests can still request receipts or download photos, but no permanent account is required.

---

## Data Model Updates

### GuestProfile (existing)
- Ensure fields capture all trip requirements (`phone`, `dob`, `medical_notes`, etc.).
- Add auditing timestamps (`updated_at`) to show when the guest last confirmed details.

### GuestAccessToken (new)
- Foreign key to `GuestProfile` and optional `Booking`.
- Stores a hashed token (similar to password reset tokens), expiration timestamp, and single-use flag.
- Used to validate public requests without full authentication.

### Booking (existing)
- Add status fields for `payment_state`, `waiver_state`, `info_state`.
- Track `last_guest_activity_at` for staff dashboards.

### Waiver Integration
- If using a third-party provider, store webhook references and link back to `Booking` / `GuestProfile`.

### Audit / History
- Maintain relationships so we can easily answer: "Which trips has this guest attended?" and "Which guides hosted the guest?"

---

## APIs & Flows

### Public (Guest) Endpoints
- `POST /api/guests/request-link` → email, booking reference → issues a new token email.
- `GET /guest/:token` → returns a signed session or prompt to complete tasks.
- `POST /guest/:token/payment-intent` → returns Stripe session metadata.
- `PATCH /guest/:token/profile` → updates `GuestProfile`.
- `POST /guest/:token/waiver` → marks waiver complete (or proxies to provider).

### Staff Endpoints (Authenticated)
- `GET /api/guests/:id` → view profile, parties, waiver/payment status.
- `GET /api/trips/:id/parties/` → list parties (and their guests) on a trip with readiness indicators.
- `GET /api/guests?query=` → search by email/name and show history.

---

## Staff UX

- **Trip roster view**: show each guest with badges for payment/waiver/info status; quick links to resend guest link.
- **Guest details**: timeline of previous trips, notes from guides, emergency contact info.
- **Dashboard metrics**: highlight guests missing payments or waivers and which trips they're attached to.

---

## Security Considerations

- Guest links must include non-guessable, one-time or expiring tokens. Use HTTPS everywhere.
- When a guest submits updates, rotate the token or mark it as used if single-use.
- Throttle link requests to prevent abuse.
- Staff endpoints should require role checks (owners/managers full access, guides limited to their trips).
- Log significant guest interactions (profile updates, waivers) for auditing.

---

## Implementation Plan (High-Level)

1. **Backend Foundations**
   - Introduce `GuestAccessToken` model and management utilities.
   - Extend `GuestProfile` and `Booking` with new fields/status flags.
   - Build guest token issuance and validation services.

2. **Staff APIs & UI**
   - Protect trip listings with role-aware filtering (done).
   - Add staff endpoints for guest history and status updates.
   - Update dashboards/rosters to surface guest readiness indicators.

3. **Guest-Facing Pages**
   - Create token-based route(s) for guests (e.g., `/guest/:token`).
   - Integrate Stripe payment flows and waiver provider callbacks.
   - Ensure UX handles expired/invalid tokens gracefully.

4. **Notifications & Emails**
   - Implement email templates for new bookings, link requests, and reminders.
   - Integrate with whichever transactional email service the project uses.

---

## Decisions & Follow-Up

- A booking may represent multiple guests; ensure the model and UI can capture parties larger than 1 (e.g., separate `BookingGuest` rows or structured payloads).
- Guests do **not** upload files (IDs, certifications) through the app.
- Guest access tokens remain valid until **one day after** the associated trip ends; implement automatic expiry and consider manual revoke tooling later.
- No guest portal (photos/loyalty dashboards) is planned at this time. All guest interactions run through emailed magic links.

---

## References

- `docs/design/availability.md` — for context on guide availability, which interacts with trips & assignments.
- `docs/design/guests.md` (this document) — update as workflows evolve.
