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
│   │   ├── catalogues/          # Catalogue, CatalogueItem (product ordering), branding, QR codes, public API
│   │   ├── products/            # Category, Product, ProductMedia, CSV import
│   │   ├── media_library/       # MediaAsset (originals), MediaRendition (previews/thumbnails), storage usage
│   │   ├── enquiries/           # Customer, Enquiry, public enquiry form
│   │   ├── analytics/           # AnalyticsEvent + aggregate queries
│   │   ├── billing/             # Plan, PlanLimit, Subscription, Payment, PaymentEvent, Invoice, providers
│   │   ├── notifications/       # Notification, NotificationTemplate, Announcement, email sending
│   │   ├── support/             # SupportTicket, TicketMessage
│   │   ├── audit_logs/          # AuditLog + helper for recording important actions
│   │   └── platform_admin/      # Super Admin APIs, SystemSetting, backup records
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

## 5. Media pipeline

- Originals are written to storage **byte-for-byte** as received (streamed in chunks; Django
  spools uploads > 5 MB to a temp file, so large videos are never fully held in memory).
  A SHA-256 checksum is computed while streaming and stored for integrity verification.
- Derived assets (thumbnail, optimised preview, video poster) are separate `MediaRendition`
  rows/files and never overwrite the original.
- Image renditions are generated with Pillow after the upload transaction commits. Video poster
  frames require `ffmpeg`; if it is unavailable the video is still stored and served, just
  without a poster. A `process_media` management command (re)generates pending renditions and can
  be scheduled (cron / Windows Task Scheduler). **No Celery/Redis in the MVP** — added only if
  rendition load requires it.
- Production uses S3-compatible object storage through `django-storages`; large uploads go
  direct-to-storage with presigned multipart uploads (documented in SETUP.md, Phase 15).
- Storage usage is tracked per business and enforced against the plan's storage limit.

## 6. Billing & payments

- `Plan` + `PlanLimit` rows define limits; Super Admin manages them.
- A `PaymentProvider` interface (`create_checkout`, `verify_webhook`, `parse_event`) with a
  `MockPaymentProvider` for development/tests. Mock payments are flagged `is_test=True` and
  labelled as such everywhere.
- Subscriptions activate **only** when a verified webhook/event is processed. Webhooks are
  HMAC-verified and idempotent (unique `(provider, event_id)`), processed inside a transaction
  with `select_for_update` on the subscription.
- No card data is ever stored — only provider references and status.

## 7. Cross-cutting concerns

- **Errors:** uniform `{"error": {"code", "message", "details?"}, "request_id"}` body.
- **Logging:** JSON lines to stdout with a per-request `X-Request-ID` correlation ID.
- **Rate limiting:** DRF scoped throttles on auth, public enquiry, public view and webhook endpoints.
- **Audit log:** important admin/owner actions (role changes, plan changes, suspensions,
  payments) are recorded in `audit_logs.AuditLog`.
- **API docs:** OpenAPI 3 schema at `/api/schema/`, Swagger UI at `/api/docs/`.
