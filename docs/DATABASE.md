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

## Phase 4 tables (implemented — `billing/0001_initial`)

Limits are typed columns on `billing_plan` rather than key/value rows: they are queried and
validated individually, and the purchased values are snapshotted into JSON anyway.

### billing_plan
`code` **unique** slug; `name`, `description`; `price numeric(12,2)` (≥ 0); `currency char(3)`
(must be in `BILLING_CURRENCIES`); `interval` (`month`/`year`); `tier_rank` (upgrade ordering);
limits `max_catalogues`, `max_products`, `max_staff`, `storage_limit_mb`, `max_image_size_mb`,
`max_video_size_mb` (nullable = unlimited); flags `video_uploads_enabled`, `custom_branding`,
`analytics_enabled`, `csv_import_enabled`; `is_active`, `is_public`, `is_development_seed`, `sort_order`.

### billing_subscription
| Column | Notes |
| --- | --- |
| business_id | FK CASCADE (tenant) |
| plan_id | FK **PROTECT** — a purchased plan can't be deleted |
| status | see ARCHITECTURE §6; index `(business_id, status)` |
| plan_code, plan_name, plan_price, plan_currency, plan_interval, plan_tier_rank, limits (jsonb) | **immutable purchase snapshot** |
| starts_at, current_period_start, current_period_end, grace_until, activated_at, ended_at | lifecycle dates |
| cancel_at_period_end, cancelled_at, abandoned_reason | |
| pending_plan_id | FK SET NULL — scheduled downgrade |
| replaces_id | self FK — the subscription a plan change replaces |

Partial unique indexes on `business_id`: `WHERE status IN ('active','past_due')`
(`billing_one_current_sub`), `WHERE status='pending_payment'`, `WHERE status='scheduled'`.

### billing_payment
| Column | Notes |
| --- | --- |
| business_id, subscription_id | FK CASCADE / PROTECT |
| kind | `new`, `renewal`, `plan_change`, `scheduled_change` |
| status | `created`, `captured`, `failed`, `expired`; index `(business_id, status)` |
| provider, is_test, provider_order_id, provider_payment_id | **unique (provider, provider_order_id)**; partial unique (provider, provider_payment_id) when set |
| currency, subtotal, discount_amount, tax_name, tax_rate, tax_inclusive, tax_amount, amount | frozen at checkout; `amount` is what the gateway must report |
| checkout_payload (jsonb) | public data for the browser (order id, public key id) — never secrets |
| expires_at, period_start, period_end, paid_at, applied_at, last_reconciled_at | |
| failure_code, failure_message, requires_attention, attention_reason | review queue |

Partial unique `(business_id) WHERE status='created'` — one open checkout per business.
**No card numbers, CVVs, UPI PINs, VPAs or customer contact data are stored.**

### billing_paymentevent
bigint PK; `provider`, `event_id` — **unique (provider, event_id)** (idempotency);
`event_type`, `outcome` (`processed`/`ignored`), `detail`, `summary` (jsonb: type, order id,
payment id, status, amount_minor, currency, failure_code only), `payment_id` FK SET NULL.
Raw webhook bodies are never stored or logged.

### billing_invoice / billing_invoiceline / billing_invoicesequence
- `invoice.number` **unique**, gapless per `(series, year)` via `billing_invoicesequence`
  (unique `(series, year)`, incremented under `SELECT … FOR UPDATE`). Mock payments use series `TEST`.
- `invoice.payment_id` **one-to-one** (an invoice per applied payment); `business_id` and
  `subscription_id` FK **PROTECT** (financial records outlive deletions).
- Amount, tax and period columns copied from the payment; `seller`/`buyer` jsonb snapshots.
- `invoiceline`: description, plan_code, quantity, unit_price, amount.

## Phase 5 tables (implemented)

Migrations: `media_library/0001`, `products/0001`, `catalogues/0001–0003` (Django split catalogues
because `Catalogue.products` and `CatalogueItem.product` reference the products app).

### media_library_mediaasset
`business_id` (CASCADE), `kind` (image/video), `folder` (product_images, product_videos,
catalogues, category_icons, banners, others), `original` (file path), `original_filename`
(display only), `extension`, `mime_type`, `size_bytes`, `sha256`, `width`, `height`,
`duration_seconds`, `thumbnail` + `thumbnail_bytes`, `preview` + `preview_bytes`, `title`,
`alt_text`, `uploaded_by_id`. Indexes `(business_id, folder)`, `(business_id, kind)`.
Storage usage = `SUM(size_bytes + thumbnail_bytes + preview_bytes)` per business (no cached counter).

### products_category
`business_id` (CASCADE), `parent_id` (self, **RESTRICT**), `name`, `description`, `icon`,
`image_id` (media, RESTRICT), `status` (published/draft), `sort_order`.
**Unique `(lower(name), business_id)`**; **CHECK `parent_id <> id`**; indexes `(business, parent)`,
`(business, status)`. Depth ≤ 3 and cycle prevention are enforced in the service layer.

### products_product
`business_id` (CASCADE), `category_id` (**RESTRICT** — products are never orphaned), `name`,
`sku`, `short_description`, `description`, `price` / `compare_at_price` (nullable numeric(12,2),
**CHECK ≥ 0**), `currency`, `show_price`, `moq` (nullable, **CHECK ≥ 1**), `moq_unit`,
`stock_status`, `tags` / `highlights` (json lists), `is_featured`, `status`
(draft/published/archived), `published_at`, `position`, `created_by_id`.
**Partial unique `(lower(sku), business_id) WHERE sku <> ''`**; indexes `(business, status)`,
`(business, category)`, `(business, -created_at)`.

### products_productmedia
`product_id` (CASCADE), `asset_id` (media, **RESTRICT**), `position` (0 = main image).
**Unique `(product_id, asset_id)`**.

### catalogues_catalogue
`business_id` (CASCADE), `name`, `slug` (**unique per business**), `description`, `tagline`,
`cover_id` / `logo_id` (media, RESTRICT), `theme_color` (#rrggbb), `show_prices`,
`whatsapp_number`, `contact_email`, `enquiries_enabled`, `status`, `published_at`,
`archived_at`, `created_by_id`. Index `(business, status)`.
Public URL = `{PUBLIC_CATALOGUE_BASE_URL}/{business.slug}/{catalogue.slug}`.

### catalogues_catalogueitem
`catalogue_id` (CASCADE), `product_id` (CASCADE), `position`, `added_at`.
**Unique `(catalogue_id, product_id)`**; index `(catalogue_id, position)`.

Tenant ownership: every Phase 5 table has `business_id` except the two join tables, which are
owned through their parent (`product.business` / `catalogue.business`). The service layer
guarantees both sides of a join belong to the same business.

## Planned tables (by phase)

| Phase | Table | Key relationships / constraints |
| --- | --- | --- |
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
