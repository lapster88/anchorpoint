# Guide Service Features — Design Outline

This document captures the implementation plan for the guide service management user stories. The scope currently includes Stripe Connect integration, branding (logo upload), trip templates, and guide roster management. Reporting features are deferred until requirements are finalized.

## Stripe Connect Integration

### Overview
- Use **Stripe Connect Express** so each guide service links its own Stripe account through Stripe’s onboarding flow.
- Store only the Stripe Connect account ID plus OAuth tokens; Stripe handles KYC/compliance.
- Expose connection status and webhook health in the service settings UI.

### Backend
1. Install and configure the Stripe Python SDK.
2. Extend data model (e.g., `ServiceStripeAccount`) to hold:
   - `stripe_account_id`
   - `access_token`, `refresh_token`, `scope`
   - `charges_enabled`, `payouts_enabled`, `details_submitted`
   - `last_webhook_received_at`, `last_webhook_error`
   - Timestamps for first/last connection, created_by.
3. Endpoints:
   - `POST /api/orgs/<service_id>/stripe/connect` — create a Stripe account link, return onboarding URL.
   - `POST /api/orgs/stripe/callback` — exchange authorization code for tokens, persist account linkage, refresh dashboard link.
   - `POST /api/orgs/<service_id>/stripe/disconnect` — deauthorize and clear stored credentials.
   - `GET /api/orgs/<service_id>/stripe/status` — return connection state, account flags, last webhook.
4. Webhooks:
   - Add `/api/webhooks/stripe/` endpoint; verify signatures with webhook secret.
   - Handle events like `account.updated`, `capability.updated`, `payment_intent.*`, `payout.*`.
   - Update `ServiceStripeAccount` status fields and log failures for UI display.

### Frontend
1. Service settings page card:
   - “Connect Stripe” button (launches new window to account link URL).
   - Show connected account name/email, `charges_enabled`, `payouts_enabled`, last webhook time.
   - Buttons for “View Stripe Dashboard” (Express Dashboard link) and “Disconnect”.
   - Display warnings if connection is incomplete or webhooks are failing.
2. Provide toast/inline status feedback during connect/disconnect flows.

### Infra / Configuration
- Add environment variables for Stripe Connect client ID, secret key, and webhook signing secret.
- Required env vars: `STRIPE_SECRET_KEY`, `STRIPE_CONNECT_CLIENT_ID`, `STRIPE_CONNECT_RETURN_URL`, `STRIPE_CONNECT_REFRESH_URL`, `STRIPE_WEBHOOK_SECRET`.
- Update developer onboarding docs to cover Stripe dashboard setup (redirect URLs, webhook config).
- Ensure dev/test environment can simulate Stripe OAuth (use `stripe-cli` or mocked endpoints).

## Logo Upload

### Requirements
- Owners/managers can upload a logo (JPEG, PNG, SVG).
- Files stored in S3; no image processing initially.
- Reasonable size limits (e.g., <= 2 MB).

### Implementation
- Added optional `logo` `ImageField` on `GuideService` with `/api/orgs/<id>/logo/` endpoints secured to owners/managers.
- Supports multipart uploads, file-type/size validation, and deletion. Local storage defaults to `MEDIA_ROOT`; `USE_S3_MEDIA=true` switches to S3 using `django-storages`.
- `ServiceMembershipSerializer` exposes `guide_service_logo_url` so the frontend can show logos without extra calls.
- Frontend settings page surfaces upload/remove controls and reflects updates immediately via React Query.

### Backend
1. Configure `django-storages` (or existing storage layer) to upload to S3.
2. Add fields to `GuideService`: `logo_url`, `logo_updated_at`.
3. Endpoint: `POST /api/orgs/<service_id>/logo` accepting multipart file.
   - Authorize owner/manager.
   - Validate file type/size.
   - Save to S3, update `logo_url`.
   - Support `DELETE` to remove logo.

### Frontend
1. Settings card with file dropzone:
   - Preview current logo.
   - Accept JPEG/PNG/SVG with size validation.
   - Show uploading indicator and error messages.
2. Persist changes via API; on success, refresh service context so UI reflects new branding.

### Notes
- Consider future enhancement for direct-upload via S3 pre-signed URLs if needed.
- Update devseed with placeholder logos stored locally.

## Trip Templates

### Requirements
- Templates bundle reusable trip metadata (title, duration, location, staffing ratios) and tiered pricing.
- Pricing fields: currency, optional deposit percent, and contiguous per-guest tiers ending in an open-ended tier.
- Templates can be duplicated to jump-start variations (e.g., seasonal tweaks).
- When a trip is created from a template we snapshot the template metadata + pricing so later edits do not affect booked trips.

### Backend
1. `TripTemplate` stores metadata plus pricing JSON (`pricing_currency`, `is_deposit_required`, `deposit_percent`, `pricing_tiers`).
2. Trip creation snapshots the template via `template_snapshot` and writes a flattened `pricing_snapshot` on the trip.
3. Template duplication endpoint clones the template (including pricing tiers) and prefixes the title with "(Copy)".
4. Validation enforces contiguous tiers, starting at guest count 1 with the final tier open-ended.

### Frontend
1. Service settings expose a templates card listing templates, pricing previews, and actions (edit, duplicate, deactivate/delete).
2. The modal editor captures metadata + tier rows directly (no separate pricing screen).
3. Trip create form shows a template dropdown; choosing a template pre-fills metadata, displays pricing tiers, and disables manual price entry.
4. Manual trips still collect duration/ratio/price; templates remain optional.

### Tests
- Backend tests cover template CRUD, duplication, and trip snapshot behavior.
- Frontend tests cover template management UI (create/edit/duplicate/delete) and trip form interactions with templates.
## Guide Roster

### Requirements Recap
- Owners/managers invite anyone (guides or office managers) via email.
- Pending invites stay visible with status and expiry; owners can resend or cancel.
- Invite acceptance supports new-user registration or existing accounts.
- When a member is deactivated or removed, upcoming trip assignments must clear automatically.

### Implementation Notes (Oct 2025)
- New roster API (`/api/orgs/<service_id>/members/`) exposes active members plus pending invitations.
- `ServiceInvitation` tracks pending invites with token + expiry; acceptance endpoint lives under `/api/auth/invitations/<token>/accept/`.
- Frontend roster page (`/service-roster`) lets owners/managers invite, toggle active, resend/cancel invites.
- Deactivating a member removes their future `Assignment` rows so schedules stay accurate.
- Inviting an email that already has an account creates/activates the membership immediately instead of issuing an invite.

### Requirements
- Owner/manager needs to manage guides attached to service:
  - View roster.
  - Add guide via invite (existing user or new email).
  - Toggle guide `is_active`.
  - Remove guide membership.
- Inactive guides remain able to log in but should be excluded from scheduling/reporting.

### Backend
1. Extend `ServiceMembership`:
   - Fields: `invited_email`, `invite_status` (pending, accepted, expired), `invite_token`, `invite_expires_at`, `invited_by`.
2. Invite flow:
   - `POST /api/orgs/<service_id>/guides/invite` with email + role.
   - If user exists, attach membership immediately and send notification.
   - If user doesn’t exist, create pending membership with invite token, email signup link.
3. Activation toggle:
   - `PATCH /api/orgs/<service_id>/guides/<membership_id>` to set `is_active`.
   - Soft deletion (or `DELETE`) for removing guides.
4. Resend and expiry:
   - `POST /api/orgs/guides/<membership_id>/resend`.
   - Background job to expire invites past `invite_expires_at`.
5. Ensure scheduling queries respect `is_active` (e.g., default to filtering out inactive guides from availability/trip assignment lists).

### Frontend
1. Roster table (name/email, role, status, active toggle).
2. “Invite guide” modal:
   - Email input with typeahead for existing users (optional).
   - Role selection.
   - Display invite status and allow resending.
3. Inactivation indicator:
   - Clearly show inactive guides in the roster.
   - Provide tooltip describing impact (e.g., “Inactive guides can’t be assigned to new trips”).

### Tests
- API tests for invite flows, permission checks.
- Frontend component tests for table interactions.
- Verify inactive guides excluded from scheduling list.

## Supporting Updates

- **Trip Creation**: Ensure UI and API leverage pricing snapshots and template metadata.
- **Docs**: Update `docs/PROJECT_CONTEXT.md` and onboarding docs with new settings.
- **Seeds**: Add sample trip template and guide invite to devseed.
- **Environment**: Document S3 and Stripe env vars; update `.env.example`.
- **Testing**:  
  - Backend: unit and API tests per feature.  
  - Frontend: tests for settings views (logo, pricing, templates, roster).  
  - E2E: smoke test linking Stripe (mock), creating template, inviting guide.

## Out of Scope / Future
- Reporting (trip/guest statistics) — to be designed later.
- Image processing (resizing/cropping) for logos.
- Stripe Connect Custom (if future needs require deeper integration).
