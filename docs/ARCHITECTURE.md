# myEcatalogues — Architecture

## 1. Overview

myEcatalogues is a multi-tenant SaaS for businesses to publish digital product catalogues,
share them by link/QR code, collect enquiries and track analytics.

```
 Browser (React SPA)                      Public visitor (mobile)
   │  Bearer JWT                              │  anonymous
   ▼                                          ▼
 ┌───────────────────────── Django + DRF  /api/v1 ─────────────────────────┐
 │ accounts · businesses · rbac · catalogues · products · media_library   │
 │ enquiries · analytics · billing · notifications · support · audit_logs │
 │ platform_admin · core (shared base classes, errors, pagination)        │
 └────────────┬──────────────────────────────┬────────────────────────────┘
              ▼                              ▼
         PostgreSQL                 Media storage (local disk in dev,
   (shared DB, tenant FK)           S3-compatible object storage in prod)
```

- **Backend:** Django 5.2 LTS, Django REST Framework, Simple JWT, drf-spectacular, PostgreSQL.
- **Frontend:** React 19 + Vite 7 + TypeScript, Tailwind CSS 4, React Router 7, TanStack Query 5,
  React Hook Form + Zod, Axios, Lucide icons.
- **Deployment target:** Linux containers/VMs behind a reverse proxy (gunicorn + nginx or a PaaS);
  SPA served as static files/CDN. Development runs natively on Windows 11.

## 2. Repository layout

```
myEcatalogues/
├── backend/
│   ├── config/                  # settings (base/dev/test/prod), root + v1 URL confs, wsgi/asgi
│   ├── apps/
│   │   ├── core/                # abstract models, error handler, pagination, request-id logging, health
│   │   ├── accounts/            # custom User, auth, email verification, password reset
│   │   ├── businesses/          # Business (tenant), BusinessMembership, StaffInvitation, tenant context
│   │   ├── rbac/                # permission registry, Permission, Role (system + custom), role services
│   │   ├── catalogues/          # Catalogue, CatalogueItem (per-catalogue ordering), branding, public API
│   │   ├── products/            # Category (tree), Product, ProductMedia (ordered)
│   │   ├── media_library/       # MediaAsset (original + thumbnail/preview), upload validation, storage usage
│   │   ├── enquiries/           # Customer, Enquiry, public enquiry form
│   │   ├── analytics/           # AnalyticsEvent + aggregate queries
│   │   ├── billing/             # Plan, Subscription, Payment, PaymentEvent, Invoice(+Line, Sequence), providers
│   │   ├── notifications/       # Notification, NotificationPreference, EmailTemplate, Announcement, email rendering
│   │   ├── support/             # SupportTicket, TicketMessage
│   │   ├── audit_logs/          # AuditLog + helper for recording important actions
│   │   └── platform_admin/      # Super Admin dashboard, business/user/catalogue oversight, system status (no models)
│   ├── requirements.txt / requirements-dev.txt / pytest.ini / .env.example / manage.py
├── frontend/
│   └── src/
│       ├── app/                 # App root, providers, query client
│       ├── api/                 # axios client, typed endpoint functions + query hooks per domain
│       ├── components/          # reusable UI (ui/ primitives, data tables, forms, feedback states)
│       ├── layouts/             # PublicLayout, OwnerLayout (sidebar), AdminLayout
│       ├── features/            # domain modules (auth, catalogues, products, ...) – components + hooks
│       ├── hooks/ routes/ pages/ types/ utils/ assets/
├── docs/  (ARCHITECTURE, DATABASE, API, SETUP)
├── docker-compose.yml           # PostgreSQL + Mailpit for local development
└── README.md
```

Apps are added to `INSTALLED_APPS` only when they are implemented, so every phase leaves a
working, migratable project.

### Changes from the initially proposed app list (and why)

| Proposed | Decision | Reason |
| --- | --- | --- |
| `categories` | merged into `products` | Categories exist only to classify products; same tenant, same permissions. |
| `qr_codes` | merged into `catalogues` | A QR code is a rendering of a catalogue's public URL. |
| `customers` | merged into `enquiries` | Customers are created from enquiries; one lead pipeline. |
| `subscriptions`, `payments`, `invoices` | merged into `billing` | One transactional workflow (pay → verify → activate → invoice); splitting creates circular imports. |
| `staff` | split: `rbac` + `businesses` | Roles/permissions live in `rbac`; memberships and staff invitations live with the tenant in `businesses`. |
| — | added `core` | Shared, model-less infrastructure that every app depends on. |

## 3. Multi-tenancy

- **Tenant = `Business`.** Shared database, shared schema; every tenant-owned table has a
  non-null `business` foreign key (or reaches one through an explicitly documented parent).
- **Active tenant selection:** the SPA sends `X-Business-ID: <uuid>` with each panel request.
  The header is **required** on business-scoped endpoints (explicit beats guessing) and is only a
  selector: `apps/businesses/context.py` resolves it to an *active membership of the
  authenticated user in an active business*. Missing/malformed header → 400; no active
  membership → 404; business suspended by the platform → 403.
- **Enforcement point:** `BusinessScopedViewMixin` (`apps/businesses/mixins.py`) adds the
  `HasBusinessPermission` class, which resolves the context once per request and checks the
  view's `required_permissions[action]`. Actions missing from that map are denied (closed by default).
- **Queryset scoping:** every tenant viewset derives its queryset from `request.business`, so
  objects from other tenants are invisible (404, not 403, to avoid leaking existence).
- **Writes:** `business` is set server-side from `request.business`, never from the payload.
  Cross-object references in a payload (e.g. `category`, `catalogue`, `media`) are validated to
  belong to the same business.
- **Platform admins** do not use tenant endpoints; they use `/api/v1/admin/...`, guarded by
  `IsPlatformAdmin` / `IsPlatformSuperAdmin` permissions.
- Cross-tenant access is covered by dedicated tests in every tenant app.

## 4. Authentication & authorization

- Custom `accounts.User` (UUID pk, case-insensitive unique email, `platform_role`).
- JWT access (15 min) + rotating refresh tokens (7 days). Rotation, logout, password change and
  password reset blacklist refresh tokens (password change/reset revoke **all** of them).
- Email verification uses a timestamped signature over (user id, email), valid 48 h. Password
  reset uses Django's `PasswordResetTokenGenerator` (bound to the password hash → single use), valid 1 h.
  Password-reset requests always return 200, so they can't be used to discover accounts.
- Email verification is not required to sign in or create a business; it will be required
  before subscribing to a paid plan (Phase 4).
- **RBAC** (`apps/rbac`): `registry.py` is the single source of truth for permission codes and
  system roles; a `post_migrate` hook syncs them idempotently into `rbac_permission` / `rbac_role`.
  System roles: Business Owner, Business Admin, Manager, Staff, Catalogue Manager, Product Manager,
  Enquiry Manager, Viewer. Businesses can add custom roles.
- **One role per membership.** A membership points to exactly one role (system or custom), which
  keeps "what can this person do" and the escalation checks easy to reason about. Combining
  capabilities = creating a custom role.
- **Owner-reserved permissions** (`business.transfer_ownership`, `subscription.manage`) are
  held only by the Owner role and can never be placed in a custom role.
- **Escalation guards** (`apps/businesses/services.py`, `apps/rbac/services.py`):
  you can only assign roles/create or edit roles whose permissions you hold; nobody can change
  their own membership or edit their own role; only owners can grant the owner role or touch
  another owner's membership.
- **Last-owner protection:** demoting, suspending, removing or leaving as the last *active* owner
  is refused (`409 last_owner`). Owner rows are locked with `SELECT … FOR UPDATE` so two
  concurrent demotions can't both succeed. Ownership moves via the transfer endpoint, which
  promotes the target and steps the caller down to Business Admin atomically.
- **Invitations** represent pending access: a hashed single-use token (7-day expiry) is emailed;
  accepting requires signing in with the invited address, creates an active membership, and marks
  the email verified. Membership statuses are therefore only `active` and `suspended`.
- **Platform roles are separate:** `User.platform_role` is never writable through any business or
  profile endpoint, and platform admins get no implicit access to business endpoints (404).

### Frontend session handling

- Access token in memory; refresh token in `localStorage` so reloads resume the session. A single
  in-flight refresh is shared by concurrent 401s; if refresh fails the session is cleared and the
  user is sent to `/login` with a "session expired" notice.
- Trade-off: `localStorage` is readable by injected scripts. Mitigations: React escaping (no
  `dangerouslySetInnerHTML`), short access-token lifetime, refresh rotation + blacklist, and a
  strict Content-Security-Policy in production (Phase 15). Moving the refresh token to an
  `HttpOnly` cookie is a possible later hardening step.
- Route guards (`RequireAuth`, `RequireBusiness`, `RequirePermission`) are UX only; the API
  enforces every rule independently.
- **Subscription gate:** paid features require an active subscription; plan limits are read from
  the database (`PlanLimit`) at the point of creation (catalogue/product/upload/staff invite).

## 5a. Catalogue content model (Phase 5)

- **Categories are business-wide** (shared by all catalogues), with optional parent for
  subcategories (max depth 3, cycles rejected). Names are unique per business, case-insensitively.
  Category `status` only controls visibility in public navigation.
- **Products belong to a business and to exactly one category**; they can appear in **many
  catalogues** via `CatalogueItem`, which stores a per-catalogue display position.
- Status lifecycle for products and catalogues: `draft` → `published` → `archived` (the PDF's
  "Inactive"). Archived items don't count towards plan limits; restoring re-checks the limit.
- **Deleting a category never orphans products:** the API refuses (`409 category_in_use`) unless
  `?reassign_to=<category>` moves them first. Categories with subcategories can't be deleted.
- **Public visibility** (enforced in `catalogues/views.py`, not the SPA): business `active` **and**
  has paid access, catalogue `published`, product `published` and assigned to that catalogue.
  Anything else is a 404. Prices are hidden when the catalogue or product says so.
- **Write rules:** creating/editing/publishing content needs paid access; deleting, archiving and
  unpublishing are always allowed (so customers can get back under limits). Limit checks run under
  `SELECT … FOR UPDATE` on the business row (`entitlements.lock_business`), verified with parallel
  requests on PostgreSQL.
- **Cross-tenant references** in payloads (category, parent, media, catalogues, cover/logo) go
  through `BusinessScopedPrimaryKeyField`/explicit lookups and are rejected like non-existent ids.

## 5b. Enquiries, customers, QR codes & analytics (Phase 6)

**Enquiries (`apps/enquiries`).** `Enquiry` keeps a *snapshot* of what the visitor typed (name,
phone, email, message, quantity) plus the product and catalogue *names* at submission time, so
history stays readable after a product is renamed or deleted (`product`, `catalogue` and
`customer` FKs are `SET_NULL`). Only `status` and `internal_notes` are editable by staff.
`submit_public_enquiry` runs in one transaction and handles, in order: idempotency key (partial
unique constraint per business), 10-minute duplicate window, customer matching, and an
on-commit email to the business. Spam handling sits in the view: honeypot field and a minimum
form-open time give a fake `201` so bots learn nothing; the `public_enquiry` throttle caps volume.
Logs carry ids only, never contact details.

**Customers.** Matched by normalised phone (digits, 7–15), then case-insensitive email; enforced
by partial unique constraints `(business, phone)` and `(business, lower(email))`. Public input
fills empty fields but never overwrites a name staff have set. Deleting a customer unlinks its
enquiries instead of deleting them.

**QR codes (`apps/catalogues/qr.py`).** Rendered on request (PNG via `qrcode`+Pillow, SVG as
paths), never stored — the image is a pure function of the public URL, so there is nothing to
invalidate when a slug changes. Only published catalogues get one (`409` otherwise). The default
target adds `?src=qr` so scans are attributed in analytics. Brand colours that are too light to
scan (contrast vs white) fall back to black.

**Analytics (`apps/analytics`).** One `AnalyticsEvent` row per counted view
(`catalogue_view` / `product_view`). The public page sends a beacon with a random per-browser id;
the server ignores bot User-Agents and repeats by the same visitor/item within 30 minutes. Stored
per row: business, catalogue, product, source, coarse device class and `visitor_key =
HMAC(SECRET_KEY, business_id:visitor_id)` — no IP, no User-Agent, no cross-business linkability.
Locations are therefore not available. Reports aggregate on the fly (indexed by business/type/time)
with `TruncDate(tzinfo=…)` so day buckets follow the viewer's timezone; ranges are capped at 366
days. Access needs `analytics.view` *and* the plan flag `analytics_enabled`. Enquiry counts come
from `Enquiry` rows, so the two series are consistent with the Enquiries page. Rotating
`SECRET_KEY` resets unique-visitor continuity (counts stay correct).

## 5. Media pipeline

- Originals are written to storage **byte-for-byte** as received (streamed in chunks; Django
  spools uploads > 5 MB to a temp file, so large videos are never fully held in memory).
  A SHA-256 checksum is computed while streaming and stored for integrity verification.
- Derived files live on the same `MediaAsset` row (`thumbnail` 480 px and `preview` 1600 px,
  WebP, EXIF-rotated) and never overwrite the original. Grids use thumbnails; public pages use
  previews; only the owner's media library exposes the original URL.
- **Implemented (Phase 5):** type detection from file content (Pillow for JPEG/PNG/WebP, `ftyp`
  box for MP4/MOV) that must match the extension; decompression-bomb guard; video duration read
  from the `mvhd` box by a streaming parser (no ffmpeg needed). Renditions are generated
  synchronously during upload (small images take milliseconds); if generation fails the asset is
  kept and clients fall back to the original. **Video poster frames are not generated** (ffmpeg is
  not installed); videos show a play placeholder. **No Celery/Redis** in the MVP.
- Files are written before the DB row; any failure (validation, plan limit, DB error) deletes
  them again, and deleting an asset removes its files only after the transaction commits.
- Storage paths are `businesses/<business>/media/<random uuid>/original.<ext>`; the client's
  filename is kept only as a display name. With local storage, files are served by Django in
  DEBUG only and are protected by unguessable URLs, not authentication — production should use a
  private S3-compatible bucket with signed URLs (Phase 15).
- Production uses S3-compatible object storage through `django-storages`; large uploads go
  direct-to-storage with presigned multipart uploads (documented in SETUP.md, Phase 15).
- Storage usage is tracked per business and enforced against the plan's storage limit.

## 6. Billing & payments (`apps/billing`)

### Layers

```
views.py ──► services.py (subscription rules, idempotent event processing, activation)
                │                 │
                │                 └─► invoices.py (gapless numbering, snapshots, PDF via reportlab)
                ├─► entitlements.py (subscription required? within plan limits?)
                └─► providers/ (gateway I/O only)
                      base.py      PaymentProvider interface + ProviderEvent
                      mock.py      dev/tests only, HMAC-signed webhooks, is_test=True
                      razorpay.py  prepared adapter — NOT verified against a sandbox
```

Providers never touch subscriptions; services never call a gateway API directly except through
the interface. Swapping gateways means writing one adapter.

### Plans and snapshots
- `Plan` has typed limits (`max_catalogues`, `max_products`, `max_staff`, `storage_limit_mb`,
  `max_image_size_mb`, `video_uploads_enabled`, `max_video_size_mb`) and feature flags
  (`custom_branding`, `analytics_enabled`, `csv_import_enabled`); `null` = unlimited. One plan =
  one interval (monthly and yearly are separate plans sharing a `tier_rank`).
- Buying copies name, price, currency, interval and limits onto the `Subscription`; each `Payment`
  and `Invoice` stores its own amounts. Editing or deactivating a plan affects **new purchases
  only**. Plans that were ever purchased cannot be deleted (deactivate instead).
- **No real prices exist yet.** `seed_dev_plans` creates `[DEV]` placeholders flagged
  `is_development_seed`; they are never listed or purchasable when the mock provider is off.

### Activation guarantee
The only code path that grants paid access is `services._apply_captured_payment`, reached from:
1. a webhook whose signature the provider verified, or
2. reconciliation, which asks the gateway API for the order's state.

Before applying, the event's amount (minor units) and currency must equal the payment's
frozen `amount`/`currency`, and the order id must match. The browser's "I paid" callback
(`/confirm/`) only verifies the provider's checkout signature and then triggers reconciliation.

Webhook processing is idempotent: `PaymentEvent(provider, event_id)` is unique; a re-delivered
event returns `duplicate`; a failure after a capture is ignored (out-of-order); a second capture on
an already paid order is flagged for refund. Mismatched amounts, captures for checkouts that were
replaced, or renewals for ended subscriptions are recorded but **flagged `requires_attention`**
instead of activating anything — a human decides (refund/apply).

### Subscription lifecycle

| Status | Meaning |
| --- | --- |
| `pending_payment` | Checkout created, no verified payment |
| `scheduled` | Paid downgrade that starts at the current period end |
| `active` | Paid and within period |
| `past_due` | Period ended unpaid; access continues until `grace_until` (`SUBSCRIPTION_GRACE_DAYS`, default 0) |
| `cancelled` | Customer cancelled; ended at period end |
| `expired` | Not renewed before grace ended |
| `superseded` | Replaced by a plan change |
| `abandoned` | Checkout never paid (expired / replaced / cancelled) |

Partial unique indexes guarantee at most one current (`active`/`past_due`), one
`pending_payment`, one `scheduled` subscription and one open (`created`) payment per business.
Checkouts lock the business row, so double-clicks return the same open checkout.

Date-driven transitions (`sync_business`) run **on every read** of a business's subscription and
via `manage.py sync_subscriptions`, so access is correct even if the scheduler never ran.

### Plan-change rules (pending commercial approval — easy to change in `services.py`)
- **New:** pay → active immediately for 30 / 365 days. No free trial.
- **Renewal** (same plan): allowed within `RENEWAL_WINDOW_DAYS` of period end, or while past due.
  Extends from the old period end (or from now if past due). Charged at the subscription's
  **snapshot price** (price increases apply to new purchases and plan changes).
- **Upgrade** (higher `tier_rank`, or same tier with a longer interval): pay → new subscription
  active immediately, old one superseded. **No proration/credit** for unused time.
- **Downgrade:** cannot be paid immediately. It is scheduled (`pending_plan`); paying the next
  period creates a `scheduled` subscription that takes over at period end. Refused if current
  usage exceeds the target plan's limits.
- **Cancel:** access continues until period end, then `cancelled`. No automatic refunds.
- **Abandoned checkout:** expires after `CHECKOUT_EXPIRY_MINUTES`; a late but verified capture
  still activates it if nothing replaced it.

### Entitlements
`entitlements.assert_within_limit(business, "max_staff")` raises `402 subscription_required` or
`402 plan_limit_exceeded`. Usage counters are registered per limit key; staff seats (active
members + pending invitations) are enforced now; catalogues, products and storage register their
counters in Phases 5–6.

### Tax & invoices
Tax is **off by default**: `BILLING_TAX_RATE=0`, no tax name. When configured, the breakdown
(exclusive or inclusive) is frozen on the payment at checkout and copied to the invoice. Nothing
here claims GST or any other compliance. Invoice numbers are gapless per series and year
(`INV-2026-000001`); mock payments use a separate `TEST-` series and are watermarked.

### Platform permissions
Super Admin APIs (`/api/v1/admin/...`) use `HasPlatformPermission` with codes derived from
`User.platform_role` (`apps/accounts/platform.py`): Super Admin has every `platform.*` code; Support
Admin has the billing view codes plus the support codes below. These codes never appear in business roles.

**Role-sync policy.** Platform role → permission mapping lives in code, not per user, so a change
applies to everyone with that role on their next request. Every change is listed here:

| Phase | Change | Who gains it |
| --- | --- | --- |
| 7 | `platform.support.view`, `platform.support.manage` | Super Admin, Support Admin (ticket handling is the Support Admin's job) |
| 7 | `platform.audit_log.view` | Super Admin only |
| 8 | `platform.announcement.manage`, `platform.email_template.manage` | Super Admin only |
| 9 | `platform.dashboard.view`, `platform.business.view`/`.manage`, `platform.user.view`/`.manage`, `platform.catalogue.view`/`.manage`, `platform.system.view` | Super Admin only (Support Admin unchanged — it never sees platform revenue, user lists or business data outside tickets) |

Business permissions `support.view`, `support.create` and `audit_log.view` already existed in
`apps/rbac/registry.py` (Phase 3) and are unchanged; no business role gained anything in Phase 7.
Phase 8 uses the existing `settings.update` permission (Owner and Business Admin hold it) for
branding and catalogue defaults; no business permission was added or re-assigned.

## 6b. Notifications, activity log & support (Phase 7)

**In-app notifications (`apps/notifications`).** One `Notification` row per recipient, with the
tenant (`business`, null for personal/platform alerts), category, level, short title/body, an in-app
`link` and a target reference. `services.notify()` / `notify_members(business, permission)` are the
only writers; recipients are chosen *by permission at creation time* (e.g. `enquiry.view`), so
people are only told about things they can open. Messages carry names and product titles at most —
never customer phone, email or message text. Each event has a `dedup_key`; the partial unique
constraint `(recipient, dedup_key)` plus `bulk_create(ignore_conflicts=True)` makes retries and
re-delivered webhooks harmless. Notifications are created inside the transaction of the change, so
a rollback leaves none behind. Listing is always `recipient = request.user`, and rows from
businesses the user has left (or that are suspended) are hidden. The UI polls the summary every 60 s;
there is no websocket or background worker. Email is untouched: existing emails are still sent from
the same places (once), and the notifications module never sends email.

**Activity log / audit trail (`apps/audit_logs`).** Append-only `AuditLog` (the model refuses
updates and deletes; the API is read-only; Django admin is read-only). Written only through
`audit_logs.services.record()` (`record_ctx(ctx, …)` for business actions, `record_platform(…)` for
platform staff) from the *service layer*, inside the same transaction as the change. Each entry
stores actor (+ name snapshot and type: user, platform admin, system, public), business, action
(`module.verb`), target type/id/label, `changes` for whitelisted fields and small `metadata`.
Redaction happens centrally: keys that look sensitive (password, token, secret, key, card, phone,
email, message, notes, description…) become `[redacted]`, long values are truncated, enquiries and
customers are labelled by reference only. No IP address or User-Agent is stored. Scopes:
`business` (shown in that business's Activity Log, needs `audit_log.view`), `platform` (Super Admin
actions such as plan edits) and `account` (sign-in, password change/reset) — the last two are visible
only to Super Admins. Platform staff acting on a business appear to the business as "myEcatalogues team".
Recorded today: catalogues, products, categories, media, enquiries, customers, team/invitations/roles,
business profile, subscription and payment state changes (webhooks, sync job, owner and admin
actions), plans, payment reconciliation, support tickets, sign-ins and password changes.

**Support tickets (`apps/support`).** `SupportTicket` (sequential `TKT-1001…` number, business,
creator, category, priority, status, assignee, timestamps) and `TicketMessage` (messages *and* timeline
events, `is_staff`, `is_internal`). Business visibility: members with `support.view` see all of their
business's tickets, others only their own; creating needs `support.create`. Internal notes and
internal events (e.g. assignment) are filtered out of every business-facing response, and staff are
shown as "Support team". Status transitions are enforced in `support/services.py` (`TRANSITIONS` for
staff, `REQUESTER_TRANSITIONS` for requesters) and mirrored in the frontend only to hide buttons.
Creating is idempotent via `client_key` (unique per creator). Replies and resolution email the
requester after commit through `send_templated_email`, which logs and swallows failures — a mail
outage never changes ticket state. Ticket text is never written to logs.

## 6c. Settings, preferences, email templates & announcements (Phase 8)

**Settings data** lives on the existing `Business` row (logo, brand colour, social links, catalogue
defaults, `enquiry_email_enabled`) — no second settings table. Profile fields need `business.update`;
branding/defaults (`/business-settings/`) need `settings.update`. Defaults are applied in
`catalogues.services.create_catalogue` when a client omits the field, and prefilled in the editor.

**Notification preferences** (`notifications/preferences.py`): groups map notification categories to
two channels, each `None` (doesn't exist), *locked* (mandatory) or a default. A row in
`NotificationPreference` exists only once a user changes something, so existing users needed no data
migration. `notify()` filters recipients through `in_app_allowed()` unless the group is locked or the
caller passes `mandatory=True`; email call sites ask `email_enabled(user, group)`. Billing in-app
messages and security/transactional emails (verification, password reset, invitations) are locked.
Preferences are per user, not per business.

**Email** (`notifications/email_templates.py`, `notifications/emails.py`, `core/emails.py`): every email
is a registry entry (key, allowlisted variables, required variables, sample data, default subject/body,
mandatory flag) sent through `send_email(key, to=…, context=…)`. An `EmailTemplate` row overrides the
default when active and valid. The renderer only substitutes `{{ name }}` placeholders from the
allowlist with literal text — editable content never reaches Django's template engine, so there is no
template injection, attribute access or file access. Validation runs on save and again at send time
(a bad row in the database falls back to the default). `core.emails.send_plain_email` logs and
swallows transport errors, as before. The old `.txt` files were replaced by registry defaults with the
same wording.

**Announcements** (`notifications/announcements.py`): audiences resolve to users only from what was
selected (all members, owners, selected businesses' members, platform staff). `deliver()` runs under
`select_for_update`, is skipped once `delivered_at` is set, and every notification uses the dedup key
`announcement:<id>`, so double clicks, re-publishing and retried scheduler runs never notify twice.
Opt-in emails are sent after commit. Scheduled announcements are published by the
`publish_announcements` management command (cron/Task Scheduler). Times are stored in UTC; the UI
converts from and to the admin's browser timezone. Delivery is synchronous — fine for today's volume;
a queue is advisable before sending to tens of thousands of users.

## 6d. Super Admin platform management (Phase 9)

`apps/platform_admin` has no models of its own; it reads and changes existing rows through
`services.py`, and every write is audited with `record_platform` inside the same transaction.

**Dashboard.** Every figure is a database aggregate (`Count`/`Sum`/subqueries) — nothing is sampled,
cached or invented; an empty platform shows zeros. Date ranges reuse `analytics.parse_range`/`bounds`
and monthly series use `TruncMonth(..., tzinfo=tz)`, so day and month boundaries follow the admin's
timezone. Revenue = captured payments with `is_test=False`, paid in the range, **grouped by currency**
(never summed across currencies). Mock-gateway payments are counted separately as `test_payments`.
Refunds are not modelled, so revenue is gross and the API says `refunds_tracked: false`. A
`(status, paid_at)` index on `Payment` (`billing 0002`) supports these queries.

**Business suspension.** Reuses the existing `Business.Status.SUSPENDED`, which the tenant middleware
already enforces: members get `403 business_suspended`, public catalogues return `404`, notifications
from that business are hidden. Nothing is deleted; subscriptions keep running and verified payments
still activate (suspension is a moderation state, not a billing state). A reason (5–300 chars) is
required, stored in the audit entry, and sent to the owners as a mandatory, business-less
notification (so they can see it while locked out). Reactivation is the same path in reverse.

**Users.** Platform staff can deactivate/reactivate accounts and change `platform_role`. Deactivating
sets `is_active=False` and revokes every refresh token; Simple JWT rejects inactive users, so access
tokens stop working at the next request. Guards in `update_user`: no change to your own account
(`409 self_change`), and the last active Super Admin cannot be deactivated or demoted
(`409 last_super_admin`) — the check locks the Super Admin rows with `select_for_update` so two
concurrent demotions can't both succeed. Responses never include password hashes. There is no custom
platform-role editor: roles and their permissions stay in code (role-sync policy above).

**Catalogue oversight.** Admins can list and inspect every catalogue and take a published one down
(→ draft) with a reason; the business is notified (mandatory) and the action is audited. Admins cannot
edit or delete business content. Admin QR codes reuse `catalogues/qr.py` and exist only for published
catalogues.

**Privacy.** Platform lists show business contact details (needed to operate the platform) but no
customer data: enquiries appear only as counts, never as a cross-business list of names, phones or
messages.

**Custom domains — not implemented.** Public catalogues are served only at
`FRONTEND_URL/c/<business>/<catalogue>`. Custom domains would need a domain model with ownership
verification (DNS TXT), TLS certificates per host, and host-based routing in the frontend server and
API (see SETUP.md). The admin "Domains & QR" page states this and offers links and QR codes only.

**System status** is read-only: health checks (database, pending migrations, email backend, payment
provider mode) and a whitelist of non-secret settings. No configuration can be changed from the UI.

## 7. Cross-cutting concerns

- **Errors:** uniform `{"error": {"code", "message", "details?"}, "request_id"}` body.
- **Logging:** JSON lines to stdout with a per-request `X-Request-ID` correlation ID. Logs carry ids,
  never customer contact details, ticket text or passwords.
- **Rate limiting:** DRF scoped throttles on auth, public enquiry, public view and webhook endpoints.
- **Audit log:** see §6b — business, platform and account-security events in `audit_logs.AuditLog`.
- **API docs:** OpenAPI 3 schema at `/api/schema/`, Swagger UI at `/api/docs/`.
