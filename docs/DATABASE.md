# myEcatalogues — Database Design

PostgreSQL 15+ (17 recommended), accessed exclusively through the Django ORM and migrations.

This document grows phase by phase. Sections marked **(implemented)** exist as migrations;
sections marked **(planned)** describe the agreed design for upcoming phases.

## Conventions

- Primary keys: UUID v4 for every table whose IDs appear in URLs or the API (prevents
  enumeration). Pure join/event tables may use `bigint` identity keys.
- Every table has `created_at` (indexed) and `updated_at` timestamps (`core.TimeStampedModel`).
- **Tenant ownership:** every tenant-owned table has a non-null `business_id` FK with
  `on_delete=CASCADE` and an index; composite indexes lead with `business_id`.
- Money is stored as `numeric(12,2)` + ISO-4217 `currency` column, never floats.
- Soft state (draft/published/archived, active/suspended) uses `CharField` choices, not deletes.
- Critical multi-row workflows (registration, payment processing, reordering) run in
  `transaction.atomic()`; payment processing locks rows with `select_for_update()`.

## accounts_user (implemented)

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid PK | |
| email | varchar(254) | unique; stored lower-cased; plus functional unique index on `lower(email)` |
| password | varchar(128) | Argon2 hash |
| full_name | varchar(150) | |
| phone | varchar(20) | optional |
| platform_role | varchar(20) | `''` (none), `super_admin`, `support_admin`; indexed |
| is_active | bool | deactivated users cannot log in |
| is_staff / is_superuser | bool | Django admin site only; API authorization uses `platform_role` + RBAC |
| is_email_verified, email_verified_at | bool, timestamptz | |
| date_joined, last_login, updated_at | timestamptz | |

Also present from Django/third-party apps: `auth_group`, `auth_permission` (Django admin only),
`token_blacklist_outstandingtoken`, `token_blacklist_blacklistedtoken` (JWT refresh rotation/logout).

## Phase 3 tables (implemented)

Migrations: `rbac/0001_initial`, `businesses/0001_initial`, `businesses/0002_initial` (Django split
the initial migration because `rbac.Role.business` and `businesses.BusinessMembership.role`
reference each other).

### businesses_business — the tenant

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid PK | stable public identifier |
| name, owner_name | varchar(150) | |
| slug | varchar(80) | **unique**; generated server-side from the name (`acme`, `acme-2`, …) |
| phone | varchar(20) | validated `^\+?[0-9][0-9\s\-()]{6,18}$` |
| email | varchar(254) | stored lower-cased |
| category | varchar(20) | retail / wholesale / manufacturer / distributor / seller / services / other |
| address_line1, address_line2, city, state, postal_code | varchar | `address_line1`, `city` required |
| country | char(2) | ISO 3166-1 alpha-2, default `IN` |
| website, description | varchar / text | optional |
| status | varchar(20) | `active` / `suspended` (platform admins only); indexed |
| created_by_id | FK → accounts_user | `SET NULL` |

### businesses_businessmembership

| Column | Notes |
| --- | --- |
| id (uuid), business_id (FK CASCADE), user_id (FK CASCADE) | **unique (business_id, user_id)** |
| role_id | FK → rbac_role, `PROTECT` (a role in use can't be deleted) |
| status | `active` / `suspended`; indexes `(user_id, status)` and `(business_id, status)` |
| invited_by_id | FK → user, `SET NULL` |

Ownership is "membership whose role is the system `owner` role". The service layer guarantees at
least one active owner per business (row-locked check).

### businesses_staffinvitation

| Column | Notes |
| --- | --- |
| business_id, role_id | FK CASCADE |
| email | lower-cased |
| token_hash | SHA-256 of the emailed token, **unique**; the raw token is never stored |
| status | `pending` / `accepted` / `revoked`; **partial unique (business_id, email) WHERE status='pending'** |
| expires_at, accepted_at, accepted_by_id, invited_by_id | |

### rbac_permission / rbac_role / rbac_rolepermission

| Table | Key constraints |
| --- | --- |
| rbac_permission | `code` unique (e.g. `product.publish`); `module`; `assignable=false` for owner-reserved codes. Rows synced from `apps/rbac/registry.py` after every migrate (46 codes). |
| rbac_role | `business_id` NULL for system roles. **Partial unique `key` WHERE business_id IS NULL**; **partial unique (business_id, name) WHERE business_id IS NOT NULL**; **CHECK** `(business_id IS NULL AND is_system) OR (business_id IS NOT NULL AND NOT is_system)`. 8 system roles. |
| rbac_rolepermission | unique (role_id, permission_id); both FKs CASCADE |

Tenant ownership: custom roles and invitations belong to one business via `business_id`;
memberships via `business_id`. System roles are global and read-only.

All of the above constraints were verified to exist in PostgreSQL 17.6 (`pg_indexes` /
`pg_constraint`) on 2026-10-18.

## Planned tables (by phase)

| Phase | Table | Key relationships / constraints |
| --- | --- | --- |
| 4 | billing_plan, billing_planlimit | plan → limits (key, int value / bool); unique (plan, key) |
| 4 | billing_subscription | business FK; plan FK; status; period dates; one current per business (partial unique) |
| 4 | billing_payment, billing_paymentevent | provider ref; unique (provider, event_id) for idempotency |
| 8 | billing_invoice | unique invoice number; payment FK |
| 5 | catalogues_catalogue | business FK; unique (business, slug); global unique public slug |
| 5 | catalogues_catalogueitem | (catalogue, product) unique; position — per-catalogue ordering |
| 5 | products_category | business FK; unique (business, name) |
| 5 | products_product | business FK; category FK (same business); status; position |
| 6 | media_library_mediaasset | business FK; original file path, mime, size, sha256, width/height/duration |
| 6 | media_library_mediarendition | asset FK; kind (thumbnail, preview, poster); unique (asset, kind) |
| 6 | products_productmedia | (product, asset) unique; position |
| 7 | enquiries_customer, enquiries_enquiry | business FK; enquiry → catalogue/product optional |
| 7 | analytics_analyticsevent | business FK; catalogue/product; event type; (business, created_at) index |
| 7 | catalogues_qrcode | catalogue FK; style options |
| 8 | notifications_*, support_*, audit_logs_auditlog | see ARCHITECTURE.md |

Storage usage is **derived** from `SUM(mediaasset.size_bytes + rendition sizes)` per business,
with a cached counter on the business updated transactionally to keep quota checks cheap.
