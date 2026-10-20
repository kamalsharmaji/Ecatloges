# myEcatalogues — API Reference

- Base path: `/api/v1/`
- Interactive docs (Swagger UI): `http://127.0.0.1:8000/api/docs/`
- OpenAPI 3 schema: `http://127.0.0.1:8000/api/schema/`

This file documents conventions plus request/response examples; the OpenAPI schema is the
authoritative, always-current list of endpoints.

## Conventions

### Authentication
`Authorization: Bearer <access_token>` (JWT). Access tokens live 15 minutes; refresh with the
rotating refresh token (7 days). Endpoints are authenticated unless marked **public**.

### Tenant selection
Business-panel endpoints act on the business given by the `X-Business-ID` header. The server
verifies the caller has an active membership in an active business; otherwise it responds `404`
(see *Tenant-context errors* below). `/businesses/{id}/` identifies the business by its path
instead, with the same membership check.

### Pagination
List endpoints accept `?page=` and `?page_size=` (max 100) and return:

```json
{
  "count": 42, "page": 1, "page_size": 20, "total_pages": 3,
  "next": "http://.../?page=2", "previous": null,
  "results": [ ... ]
}
```

Filtering uses query params (`?status=published`), search uses `?search=`, ordering `?ordering=-created_at`.

### Errors
Every error response has the same shape:

```json
{
  "error": {
    "code": "validation_error",
    "message": "email: This field is required.",
    "details": { "email": ["This field is required."] }
  },
  "request_id": "6271ac00a3b141d4ade940b7035056a7"
}
```

| Status | `code` examples |
| --- | --- |
| 400 | `validation_error` |
| 401 | `not_authenticated`, `token_not_valid` |
| 402 | `plan_limit_exceeded` |
| 403 | `permission_denied` |
| 404 | `not_found` |
| 409 | `business_rule_violation` |
| 429 | `throttled` |
| 500 | `server_error` |

Every response carries an `X-Request-ID` header; quote it when reporting problems.

### Rate limits
Anonymous 120/min, authenticated 600/min, with stricter scoped limits: auth endpoints 10/min,
public enquiry submission 5/min, public catalogue views 120/min, payment webhooks 120/min.
All are configurable via environment variables.

## Endpoints

### System

#### `GET /api/v1/health/` — public
Liveness/readiness probe.

```json
200 OK
{ "status": "ok", "database": "ok" }
```
Returns `503` with `"status": "degraded"` if the database is unreachable.

### Authentication (`/auth/…`)

All auth endpoints are rate-limited with the `auth` scope (default 10/min per client).

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/auth/register/` | public | Create account; returns tokens + user; emails a verification link |
| POST | `/auth/login/` | public | Email (case-insensitive) + password → tokens + user |
| POST | `/auth/token/refresh/` | public | Rotate refresh token → new access **and** refresh (old one is blacklisted) |
| POST | `/auth/logout/` | public | Blacklist the given refresh token (works with an expired access token) |
| GET/PATCH | `/auth/me/` | user | Own profile. Writable: `full_name`, `phone` only |
| POST | `/auth/change-password/` | user | Requires current password; revokes all refresh tokens and returns a new pair |
| POST | `/auth/verify-email/` | public | Confirm email with the emailed token (idempotent) |
| POST | `/auth/verify-email/resend/` | user | Re-send verification email (`409 already_verified` if done) |
| POST | `/auth/password-reset/` | public | Always `200` (no account enumeration); emails a single-use link if the account exists |
| POST | `/auth/password-reset/confirm/` | public | `uid` + `token` + new password; revokes all refresh tokens |

```http
POST /api/v1/auth/register/
{ "email": "Asha@Example.com", "full_name": "Asha Rao", "phone": "+91 98200 12345",
  "password": "…", "password_confirm": "…", "accept_terms": true }

201 Created
{ "access": "eyJ…", "refresh": "eyJ…",
  "user": { "id": "5c1d…", "email": "asha@example.com", "full_name": "Asha Rao", "phone": "+91 98200 12345",
            "is_email_verified": false, "platform_role": "", "date_joined": "2026-10-18T09:00:00Z" } }
```

```http
POST /api/v1/auth/login/
{ "email": "asha@example.com", "password": "wrong" }

401 Unauthorized
{ "error": { "code": "no_active_account", "message": "Invalid email or password." }, "request_id": "…" }
```

```http
POST /api/v1/auth/token/refresh/
{ "refresh": "eyJ…" }
200 OK  { "access": "eyJ…", "refresh": "eyJ…(new)" }
```

Email links point at the SPA: `{FRONTEND_URL}/verify-email?token=…`,
`{FRONTEND_URL}/reset-password?uid=…&token=…`, `{FRONTEND_URL}/invitations/accept?token=…`.

### Businesses

| Method | Path | Auth / permission | Purpose |
| --- | --- | --- | --- |
| GET | `/businesses/` | user | Caller's memberships (business, role, membership status), paginated |
| POST | `/businesses/` | user | Create a business; caller becomes owner (`409 business_limit_reached` above `MAX_BUSINESSES_PER_USER`) |
| GET | `/businesses/{id}/` | member + `business.view` | Business profile |
| PATCH | `/businesses/{id}/` | member + `business.update` | Update profile (`id`, `slug`, `status` are read-only) |
| GET | `/business-context/` | **X-Business-ID** member | Active business, caller's role and effective permission codes |
| POST | `/business-context/leave/` | **X-Business-ID** member | Leave the business (`409 last_owner` for the last active owner) |

```http
POST /api/v1/businesses/
{ "name": "Acme Textiles", "owner_name": "Asha Rao", "phone": "+91 98200 12345", "email": "sales@acme.example",
  "category": "wholesale", "address_line1": "12 Market Road", "address_line2": "", "city": "Surat",
  "state": "Gujarat", "postal_code": "395003", "country": "IN", "website": "", "description": "" }

201 Created
{ "id": "0b8e…", "slug": "acme-textiles", "name": "Acme Textiles", …, "status": "active",
  "created_at": "…", "updated_at": "…" }
```

`category` is one of `retail`, `wholesale`, `manufacturer`, `distributor`, `seller`, `services`, `other`.

```http
GET /api/v1/business-context/
X-Business-ID: 0b8e…

200 OK
{ "business": { …profile… }, "membership_id": "9a1f…",
  "role": { "id": "…", "key": "owner", "name": "Business Owner", "is_system": true },
  "is_owner": true, "permissions": ["analytics.export", "analytics.view", "business.update", …] }
```

### Team members — all require `X-Business-ID`

| Method | Path | Permission | Notes |
| --- | --- | --- | --- |
| GET | `/members/` | `member.view` | Filters: `status`, `role`; `search` (name/email); `ordering` |
| GET | `/members/{id}/` | `member.view` | |
| PATCH | `/members/{id}/` | `member.manage` | Body: `role_id` and/or `status` (`active`/`suspended`) |
| DELETE | `/members/{id}/` | `member.manage` | Remove member |
| POST | `/members/transfer-ownership/` | `business.transfer_ownership` (owners) | Body: `membership_id`; target becomes owner, caller becomes Business Admin |

Rules enforced server-side (403 unless noted): nobody can change their own membership; only owners
can change an owner's membership or grant the owner role; a role can only be assigned by someone
holding **all** of its permissions; demoting/suspending/removing the last active owner →
`409 last_owner`; transfer to an inactive member → `409 inactive_member`.

### Invitations — require `X-Business-ID` (except accept)

| Method | Path | Permission | Notes |
| --- | --- | --- | --- |
| GET | `/invitations/` | `member.view` | Filter `status=pending` |
| POST | `/invitations/` | `member.invite` | Body `email`, `role_id`. `409 invitation_pending` / `409 already_member`. Same role-assignment rules as above |
| DELETE | `/invitations/{id}/` | `member.invite` | Revoke a pending invitation |
| POST | `/invitations/accept/` | signed-in user | Body `token`. Email must match the signed-in account (403); expired → `409 invitation_expired`; used/revoked → 404 |

### Roles & permissions

| Method | Path | Permission | Notes |
| --- | --- | --- | --- |
| GET | `/permissions/` | signed-in user | Assignable permission catalogue (`code`, `name`, `module`) |
| GET | `/roles/` | `role.view` (X-Business-ID) | System roles + this business's custom roles (with `member_count`) |
| POST | `/roles/` | `role.manage` | `{ "name", "description", "permissions": ["media.view", …] }` |
| PATCH | `/roles/{id}/` | `role.manage` | System roles → `409 system_role`; you can't edit your own role |
| DELETE | `/roles/{id}/` | `role.manage` | Role still assigned → `409 role_in_use` |

Unknown or owner-reserved codes (`subscription.manage`, `business.transfer_ownership`) → `400`.
Granting a permission you don't hold → `403`. Platform privileges cannot be expressed as business
permissions at all.

### Billing — public

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/billing/plans/?interval=month` | Purchasable, public plans. Dev placeholder plans appear only when the mock provider is enabled. |
| POST | `/billing/webhooks/{provider}/` | Gateway callbacks. Authenticated by provider signature (`X-Mock-Signature` / `X-Razorpay-Signature`); `400 invalid_signature` otherwise. Returns `{"status": "processed" \| "ignored" \| "duplicate"}`. |

### Billing — business panel (require `X-Business-ID`)

| Method | Path | Permission | Notes |
| --- | --- | --- | --- |
| GET | `/billing/subscription/` | `subscription.view` | Current + scheduled subscription, open checkout, `has_paid_access`, usage vs limits |
| GET | `/billing/subscriptions/` | `subscription.view` | History (filter `status`) |
| GET | `/billing/checkout/quote/?plan_id=` | `subscription.view` | Kind (`new`/`renewal`/`plan_change`/`scheduled_change`/`downgrade`), totals, period, `blockers` |
| POST | `/billing/checkout/` | `subscription.manage` (owner) | `{plan_id}` → open payment (identical open checkout is returned again). Requires verified email (`403 email_not_verified`) |
| POST | `/billing/subscription/cancel/` · `/resume/` | `subscription.manage` | Cancel at period end / undo |
| POST | `/billing/subscription/schedule-downgrade/` | `subscription.manage` | `{plan_id}`; `409 upgrade_requires_checkout` / `usage_exceeds_plan` |
| POST | `/billing/subscription/clear-scheduled-change/` | `subscription.manage` | |
| GET | `/billing/payments/` · `/{id}/` | `payment.view` | Customer view: no gateway payment ids or review notes (`under_review` flag only) |
| POST | `/billing/payments/{id}/refresh/` | `subscription.manage` | Reconcile with the gateway |
| POST | `/billing/payments/{id}/confirm/` | `subscription.manage` | Provider checkout response; signature-verified, then reconciled. Never activates by itself |
| POST | `/billing/payments/{id}/cancel/` | `subscription.manage` | Abandon an open checkout |
| POST | `/billing/payments/{id}/simulate/` | `subscription.manage` | **Dev only** (404 unless mock enabled): sends a signed mock webhook through the real pipeline |
| GET | `/billing/invoices/` · `/{id}/` · `/{id}/pdf/` | `invoice.view` | PDF is `application/pdf` |

```http
POST /api/v1/billing/checkout/
X-Business-ID: 0b8e…
{ "plan_id": "4f1c…" }

201 Created
{ "id": "a7d2…", "kind": "new", "status": "created", "provider": "mock", "is_test": true,
  "provider_order_id": "mock_order_3f9a…", "plan_id": "4f1c…", "plan_name": "[DEV] Basic",
  "currency": "INR", "subtotal": "100.00", "tax_rate": "0.00", "tax_amount": "0.00", "amount": "100.00",
  "expires_at": "…", "under_review": false, "invoice_id": null,
  "checkout": { "provider": "mock", "order_id": "mock_order_3f9a…", "test_mode": true } }
```

Billing error codes: `402 subscription_required`, `402 plan_limit_exceeded`,
`403 email_not_verified`, `409 plan_unavailable`, `409 renewal_not_due`,
`409 downgrade_must_be_scheduled`, `409 usage_exceeds_plan`, `409 change_already_scheduled`,
`409 checkout_not_open`, `502 payment_provider_error`, `503 payment_provider_unavailable`.

### Super Admin (`/admin/…`, platform permissions)

| Method | Path | Permission |
| --- | --- | --- |
| GET/POST | `/admin/plans/` | view: `platform.plan.view`; create: `platform.plan.manage` |
| GET/PATCH/DELETE | `/admin/plans/{id}/` | `platform.plan.manage` for writes; delete → `409 plan_in_use` once purchased |
| GET | `/admin/subscriptions/` · `/{id}/` | `platform.subscription.view` (filters `status`, `business`, `plan`; `search`) |
| POST | `/admin/subscriptions/{id}/cancel/` | `platform.subscription.manage` — `{immediately: bool}` |
| GET | `/admin/payments/` · `/{id}/` | `platform.payment.view` — includes event ledger, `requires_attention`, `attention_reason` |
| POST | `/admin/payments/{id}/reconcile/` | `platform.payment.reconcile` |
| GET | `/admin/invoices/` · `/{id}/` · `/{id}/pdf/` | `platform.invoice.view` |
| GET | `/admin/support/tickets/` · `/{id}/` · `summary/` · `agents/` | `platform.support.view` (see Support tickets) |
| PATCH / POST | `/admin/support/tickets/{id}/` · `/{id}/reply/` · `/{id}/status/` | `platform.support.manage` |
| GET | `/admin/audit-logs/` · `/{id}/` · `filters/` | `platform.audit_log.view` (see Activity & audit log) |
| GET | `/admin/dashboard/` · `/admin/system/` | `platform.dashboard.view` · `platform.system.view` (see Platform management) |
| GET / POST | `/admin/businesses/…` · `/admin/users/…` · `/admin/catalogues/…` | `platform.business.*`, `platform.user.*`, `platform.catalogue.*` (see Platform management) |

Super Admin holds every `platform.*` permission. Support Admin holds the billing `*.view` ones plus
`platform.support.view` and `platform.support.manage` (Phase 7) — **not** `platform.audit_log.view`,
`platform.announcement.manage` or `platform.email_template.manage` (Phase 8, Super Admin only), and
none of the Phase 9 permissions (`platform.dashboard.view`, `platform.business.view|manage`,
`platform.user.view|manage`, `platform.catalogue.view|manage`, `platform.system.view`).
`GET /auth/me/` returns `platform_permissions` for the signed-in user. Business users get `403`.

### Catalogues, categories, products, media — require `X-Business-ID`

All list endpoints support `?page`, `?page_size` (≤100), `?search`, `?ordering`. Writes that create
or expose content return `402 subscription_required` without an active plan and
`402 plan_limit_exceeded` / `402 feature_not_in_plan` at a plan limit. Ids from another business
are 404 in URLs and 400 inside payloads.

| Method | Path | Permission | Notes |
| --- | --- | --- | --- |
| GET/POST | `/catalogues/` | catalogue.view / catalogue.create | Filters `status`, `category`; ordering `created_at`, `updated_at`, `name`, `product_count`, `view_count`, `enquiry_count` (all-time). Creating with `status: published` also needs `catalogue.publish` |
| GET | `/catalogues/summary/` | catalogue.view | `{total, published, draft, archived, limit}` |
| GET/PATCH/DELETE | `/catalogues/{id}/` | view / update / delete | `slug` must be unique per business |
| POST | `/catalogues/{id}/publish/` · `unpublish/` | catalogue.publish | |
| POST | `/catalogues/{id}/archive/` · `restore/` | catalogue.update | restore re-checks `max_catalogues` |
| GET | `/catalogues/{id}/items/` | catalogue.view | Products in catalogue order |
| POST | `/catalogues/{id}/items/add/` · `remove/` · `reorder/` | catalogue.update | `{product_ids: [...]}` |
| GET/POST | `/categories/` | category.view / category.create | Filters `status`, `parent`, `top_level`; returns `path`, `product_count`, `children_count` |
| GET | `/categories/summary/` | category.view | |
| PATCH/DELETE | `/categories/{id}/` | category.update / category.delete | `DELETE ?reassign_to=<id>` moves products first; else `409 category_in_use`; `409 category_has_children` |
| GET/POST | `/products/` | product.view / product.create | Filters `status`, `category` (incl. subcategories), `catalogue`, `exclude_catalogue`, `stock_status`, `is_featured`; search name/SKU; list rows include all-time `view_count`, `enquiry_count` (sortable) |
| GET/PATCH/DELETE | `/products/{id}/` | view / update / delete | Write fields include `media_ids` (ordered, first = main, ≤ 20) and `catalogue_ids` |
| POST | `/products/{id}/publish/` · `unpublish/` | product.publish | |
| POST | `/products/{id}/archive/` · `restore/` · `duplicate/` | product.update / product.create | |
| POST | `/products/bulk/` | per action | `{ids, action: publish|unpublish|archive|restore|delete|add_to_catalogue|remove_from_catalogue, catalogue_id?}` — any foreign id → 404, nothing changed |
| GET | `/products/summary/` | product.view | |
| GET/POST | `/media/` | media.view / media.upload | `multipart/form-data`: `file`, `folder`, `title`. Filters `kind`, `folder` |
| GET | `/media/usage/` | media.view | Counts, bytes used, plan limits, folder counts |
| PATCH/DELETE | `/media/{id}/` | media.upload / media.delete | `409 media_in_use` while referenced |
| POST | `/media/bulk/` | media.upload (move) / media.delete | `{ids, action: move|delete, folder?}` — in-use files are skipped and reported |

```http
POST /api/v1/products/
X-Business-ID: 0b8e…
{ "name": "Modern 3 Seater Sofa", "short_description": "Stylish sofa", "category_id": "c2bf…",
  "price": "28999.00", "moq": 2, "moq_unit": "sets", "status": "published",
  "media_ids": ["a7d2…", "91c0…"], "catalogue_ids": ["5e11…"], "tags": ["Sofa"] }
201 Created  { "id": "…", "status": "published", "media": [{ "id": "a7d2…", "thumbnail_url": "/media/…/thumbnail.webp", … }], … }
```

Upload errors (`400 validation_error`, field `file`): unsupported type, content doesn't match the
extension, not a valid image/video, empty, larger than `MEDIA_MAX_UPLOAD_MB`, image too large.

### Public catalogue (anonymous, rate-limited `public_view`)

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/public/catalogues/{business_slug}/{catalogue_slug}/` | Branding, business name/city, categories with published products, product count |
| GET | `/public/catalogues/{b}/{c}/products/?search=&category=&featured=true` | Published products in catalogue order, paginated |
| GET | `/public/catalogues/{b}/{c}/products/{id}/` | Product detail with gallery (thumbnail/preview URLs only) |

| GET | `/public/catalogues/{b}/{c}/qr.svg` | QR code (SVG) for the public URL with `?src=qr` |
| POST | `/public/catalogues/{b}/{c}/events/` | View beacon `{visitor_id, source, product_id?}` → `202 {recorded: bool}` (see Analytics) |
| POST | `/public/catalogues/{b}/{c}/enquiries/` | Enquiry form — own throttle `public_enquiry` (5/min) |

Returns 404 unless the business is active with paid access and the catalogue is published.
Never exposes drafts, archived items, owner/staff/billing data or original file URLs.

**Enquiry form.** Body: `name`, `phone` (7–15 digits after normalising), `email?`, `message`,
`quantity?`, `product_id?` (must be published and in this catalogue, else 400), `source?`
(`catalogue|qr_code|whatsapp|social|search`), `idempotency_key` (UUID per form instance),
`website` (honeypot, must be empty), `elapsed_ms` (time the form was open).

| Situation | Response |
| --- | --- |
| Created | `201 {status: "received", reference: "5CCC8559"}` — no customer or business data echoed |
| Same `idempotency_key`, or same phone/email + message within 10 minutes | `200` with the original reference, nothing new stored |
| Honeypot filled or `elapsed_ms < 1500` | `201` (looks accepted) but nothing stored or emailed |
| Catalogue has enquiries disabled | `403` |
| Too many submissions | `429 throttled` |

A new enquiry emails the business address (after the transaction commits) and is matched to a
customer: by normalised phone first, then case-insensitive email; a public submission never
renames an existing customer.

### Enquiries & customers — require `X-Business-ID` and an active plan

| Method | Path | Permission | Notes |
| --- | --- | --- | --- |
| GET | `/enquiries/` | enquiry.view | Filters `status`, `source`, `catalogue`, `product`, `customer`, `created_from`, `created_to` (dates); search name/phone/email/message/product/catalogue; ordering `created_at`, `status`, `name` |
| GET | `/enquiries/summary/` | enquiry.view | `{total, new, contacted, in_progress, converted, closed, this_month}` |
| GET/PATCH/DELETE | `/enquiries/{id}/` | view / enquiry.update / enquiry.delete | Only `status` and `internal_notes` are writable; contact details are the customer's own words |
| POST | `/enquiries/bulk/` | per action | `{ids, action: set_status|delete, status?}` — any foreign id → 404, nothing changed |
| GET/POST | `/customers/` | customer.view / customer.manage | Rows include `enquiry_count`, `open_enquiry_count`, `converted_count`; filter `has_open_enquiries`; phone or email required, each unique per business |
| GET | `/customers/summary/` | customer.view | |
| GET/PATCH/DELETE | `/customers/{id}/` | view / customer.manage | Detail includes the last 50 enquiries. Delete keeps the enquiries (they lose the link, keep their contact snapshot) |

Status lifecycle: `new → contacted → in_progress → converted | closed` (any transition allowed;
`status_changed_at` updates each time, `converted_at` is set the first time).

### QR codes

| Method | Path | Permission | Notes |
| --- | --- | --- | --- |
| GET | `/catalogues/{id}/qr/?type=png|svg&size=200–2000&tracking=true&color=%23RRGGBB` | qrcode.view | `409 catalogue_not_published` for drafts. `X-QR-Target` header holds the encoded URL (`…?src=qr`, or the plain URL with `tracking=false`). Colours too light to scan fall back to black |

### Analytics — require `X-Business-ID`

| Method | Path | Permission | Notes |
| --- | --- | --- | --- |
| GET | `/analytics/overview/?from=YYYY-MM-DD&to=YYYY-MM-DD&tz=Area/City` | analytics.view | Needs a plan with `analytics_enabled` (`402 feature_not_in_plan`) and paid access (`402 subscription_required`). Range inclusive, ≤ 366 days, in `tz` (400 on bad dates/timezone) |

Response: `range`, `totals` and `previous` (same-length previous period) with `catalogue_views`,
`product_views`, `unique_visitors`, `products_viewed`, `enquiries`, `conversions`; daily `series`;
`sources`; `devices` (distinct visitors); `enquiries_by_status`; `top_catalogues`, `top_products` (5 each).

**What counts as a view:** one beacon from the public page per browser (random `visitor_id`
stored in localStorage), catalogue and product views separately, de-duplicated per visitor/item
within 30 minutes. Bots and link-preview fetchers (by User-Agent) are ignored. No IP address or
User-Agent is stored — only an HMAC of the visitor id, a coarse device class and the traffic source.

### Notifications — the signed-in user's own (no `X-Business-ID` needed)

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/notifications/?context=&status=unread|read&category=&search=&created_from=&created_to=` | `context` = a business id (that business only) or `platform` (not tied to a business, e.g. Support Admin alerts); omit for all. Notifications from businesses you've left or that are suspended are hidden. `400` on a bad `context` |
| GET | `/notifications/summary/?context=` | `{total, unread, categories: [{category, label, total, unread, today}]}` — drives the bell badge |
| GET / DELETE | `/notifications/{id}/` | Other users' ids are `404` |
| POST | `/notifications/{id}/read/` · `/{id}/unread/` | Returns the notification |
| POST | `/notifications/read-all/?context=` | Body `{category?}` → `{updated}` |

Categories: `enquiry`, `catalogue`, `product`, `payment`, `subscription`, `team`, `support`, `system`.
Levels: `info`, `success`, `warning`, `error`. Each row has `title`, short `body`, in-app `link`,
`target_type`/`target_id`. Notifications never contain customer phone numbers, emails or message
text — open the linked record (RBAC applies) for details.

| Event | Who receives it |
| --- | --- |
| `enquiry.received` | Active members whose role has `enquiry.view` |
| `catalogue.published` | Members with `catalogue.view`, except the person who published |
| `payment.captured`, `payment.failed`, `subscription.*` (past due, expired, cancelled, plan change active, expiry reminder) | Members with `subscription.view` |
| `invoice.issued` | Members with `invoice.view` |
| `team.member_joined` | Members with `member.view` (not the new member) |
| `team.role_changed`, `team.ownership_transferred` | The affected member |
| `team.invited` | The invitee, if they already have an account (business-less; the email link is still how to accept) |
| `support.staff_replied`, `support.status_changed` | The ticket's creator |
| `support.ticket_created`, `support.user_replied`, `support.assigned` | Support Admins / Super Admins (or the assignee) — `context=platform` |

Duplicates: each event has a dedup key (e.g. `enquiry:<id>`, `payment:<id>:captured`), unique per
recipient, so retried requests and re-delivered webhooks never create a second notification.

### Activity & audit log

| Method | Path | Permission | Notes |
| --- | --- | --- | --- |
| GET | `/activity/` · `/{id}/` | `audit_log.view` + `X-Business-ID` | This business's entries only. Filters `module`, `action`, `actor` (user id), `actor_type`, `target_type`, `target_id`, `created_from`, `created_to`; `search` (action, item, person); newest first |
| GET | `/activity/filters/` | `audit_log.view` | `{modules, actions, actors}` that occur in this business (platform staff are not listed) |
| GET | `/admin/audit-logs/` · `/{id}/` · `filters/` | `platform.audit_log.view` (Super Admin) | All scopes; extra filters `business`, `scope` (`business`, `platform`, `account`); search also matches business name and request id |

Entry: `created_at`, `actor_id`, `actor_name`, `actor_type` (`user`, `platform_admin`, `system`,
`public`), `action` (e.g. `catalogue.published`), `module`, `target_type`, `target_id`,
`target_label`, `changes` (`{field: {from, to}}`), `metadata`. Businesses see platform staff as
"myEcatalogues team". Read-only: there is no create, update or delete endpoint, and the model
refuses edits. Sensitive keys (passwords, tokens, secrets, keys, card data, phone, email,
messages, notes, descriptions) are stored as `"[redacted]"`; enquiries and customers are labelled
by reference ("Enquiry 5CCC8559"), never by name.

### Support tickets — business side (require `X-Business-ID`)

| Method | Path | Permission | Notes |
| --- | --- | --- | --- |
| GET | `/support/tickets/?status=&category=&priority=&mine=true&search=` | any member | With `support.view`: all of the business's tickets; otherwise only your own. `search` matches subject or `TKT-1001` |
| POST | `/support/tickets/` | `support.create` | `{subject (5–150), category, priority=medium, description (10–5000), client_key?}` → `201`; the same `client_key` again → `200` with the original ticket |
| GET | `/support/tickets/{id}/` | any member who can see it | Includes `messages` (chronological; no internal notes; staff shown as "Support team") |
| POST | `/support/tickets/{id}/reply/` | creator, or `support.view` + `support.create` | `{body}` → `409 ticket_closed` on closed tickets |
| POST | `/support/tickets/{id}/status/` | same | Requesters may set `closed` (any time) or `open` (only from `resolved`); anything else → `409 invalid_status_transition` |
| GET | `/support/tickets/summary/` | any member | Counts by status and category for the tickets you can see |

Categories: `technical`, `billing`, `subscription`, `catalogue`, `qr_code`, `domain`, `account`,
`feature_request`, `other`. Priorities: `low`, `medium`, `high`, `urgent`. Statuses: `open`,
`in_progress`, `waiting_for_user`, `resolved`, `closed`.

### Support tickets — Support Admin (`/admin/support/tickets/`)

| Method | Path | Permission | Notes |
| --- | --- | --- | --- |
| GET | `/admin/support/tickets/` · `/{id}/` | `platform.support.view` | All businesses. Filters `status` (repeatable), `category`, `priority`, `business`, `assigned=me|none|<user id>`; search subject, business, requester email/name, `TKT-…`. Detail includes internal notes and staff names |
| GET | `/admin/support/tickets/summary/` · `agents/` | `platform.support.view` | Counts (+ `unassigned`); staff that tickets can be assigned to |
| PATCH | `/admin/support/tickets/{id}/` | `platform.support.manage` | `{assigned_to?, priority?, category?}` — assignees must be platform staff (`400` otherwise) |
| POST | `/admin/support/tickets/{id}/reply/` | `platform.support.manage` | `{body, internal=false, status?}` — public replies notify and email the requester; internal notes never leave the platform side |
| POST | `/admin/support/tickets/{id}/status/` | `platform.support.manage` | Any transition in the policy below; resolving emails the requester |

Status policy: `open ↔ in_progress ↔ waiting_for_user`, any of those → `resolved` or `closed`,
`resolved → open | closed`, `closed → open` (staff only). A requester reply on `waiting_for_user`
or `resolved` moves the ticket back to `open`.

### Settings (Phase 8)

| Method | Path | Permission | Notes |
| --- | --- | --- | --- |
| GET / PATCH | `/businesses/{id}/` | business.view / business.update | Now also `social_links`: `{facebook, instagram, youtube, linkedin, x}` → each must be an `https://` URL on that network's own domain (else `400`). Shown on public catalogues |
| GET | `/business-settings/` | business.view + `X-Business-ID` | `{logo, brand_color, default_show_prices, default_enquiries_enabled, default_whatsapp_number, enquiry_email_enabled}` |
| PATCH | `/business-settings/` | settings.update | `logo_id` must be an image in this business's media library (`400` otherwise); `brand_color` `#rrggbb`. Audited as `business.settings_updated` |

New catalogues created without `theme_color`, `show_prices`, `enquiries_enabled` or
`whatsapp_number` take the business defaults. `enquiry_email_enabled: false` stops the new-enquiry
email to the business address; in-app enquiry notifications are unaffected. The public catalogue's
`business` object now includes `logo` (fallback when the catalogue has none) and `social_links`.

### Notification preferences — the signed-in user's own

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/notifications/preferences/` | One row per group: `key, label, description, note, in_app, email, in_app_available, email_available, in_app_locked, email_locked` (`null` = channel doesn't exist) |
| PATCH | `/notifications/preferences/` | `{preferences: [{key, in_app?, email?}]}` → the full list. Turning off a locked (mandatory) channel or setting an unavailable one → `400`, nothing saved |

Groups: `enquiry` (in-app), `catalogue` (in-app), `team` (in-app; invitation emails always sent),
`billing` (in-app **locked on**), `support` (in-app + email, both on by default), `announcement`
(in-app on, email **off** by default), `security` (email **locked on**). Users without saved rows get
the defaults. Optional notifications skip users who opted out; mandatory ones always deliver;
dedup keys are unchanged, so retries still never duplicate.

### Announcements

| Method | Path | Permission | Notes |
| --- | --- | --- | --- |
| GET | `/announcements/` | any signed-in user | Live announcements addressed to you (published, inside the start/end window), newest first, max 10 |
| GET / POST | `/admin/announcements/` | `platform.announcement.manage` | Filters `status`, `audience`, `level`; `search`. Body: `title, body, level, audience, business_ids[], send_email, starts_at, ends_at` (ISO 8601 with offset). Created as `draft` |
| GET / PATCH | `/admin/announcements/{id}/` | same | Archived ones can't be edited; after delivery `audience`, `business_ids`, `send_email` are fixed (`400`) |
| POST | `/admin/announcements/{id}/publish/` | same | → `published` (and delivered once) or `scheduled` if `starts_at` is in the future. `409 audience_empty`, `409 announcement_expired`, `409 announcement_archived` |
| POST | `/admin/announcements/{id}/unpublish/` · `/archive/` | same | Delivered notifications stay in inboxes |
| GET | `/admin/announcements/{id}/recipients/` · POST `/admin/announcements/audience-count/` | same | `{recipients}` for an announcement or an `{audience, business_ids}` draft |
| GET | `/admin/announcements/business-options/?search=` | same | Up to 20 active businesses for the picker |

Audiences: `all_businesses` (active members of active businesses), `business_owners`,
`selected_businesses` (members of the chosen businesses only), `platform_staff`. Delivery creates
one in-app notification per recipient (category `announcement`, dedup key `announcement:<id>`) and,
if `send_email`, emails only recipients whose announcement-email preference is on. Announcement
notifications appear in every business context (`/notifications/?context=<business>`).

### Email templates (Super Admin)

| Method | Path | Permission | Notes |
| --- | --- | --- | --- |
| GET | `/admin/email-templates/` · `/{key}/` | `platform.email_template.manage` | Keys: `account.verify_email`, `account.password_reset`, `team.invitation`, `enquiry.new`, `support.reply`, `support.resolved`, `announcement.published`. Each lists its allowed `variables` (with `required` flags and sample values), current and default subject/body, `is_custom`, `is_active`, `updated_at`, `updated_by_name` |
| PUT | `/admin/email-templates/{key}/` | same | `{subject, body, is_active}` — validated (below); `400` with field errors otherwise. Audited (text recorded as "changed" only) |
| DELETE | `/admin/email-templates/{key}/` | same | Reset to the built-in default |
| POST | `/admin/email-templates/{key}/preview/` | same | `{subject?, body?}` → `{subject, body, errors}` rendered with sample data. Sends nothing |
| POST | `/admin/email-templates/{key}/test/` | same (throttle `auth`) | Sends the draft with sample data **to the requesting admin's own email only** → `202 {sent_to}` |

Template syntax: plain text with `{{ variable }}` placeholders from the template's allowlist —
nothing else. Template tags (`{% %}`), comments (`{# #}`), filters (`|`), attribute access
(`a.b`), unknown variables, a missing required variable (e.g. the verification link) or a
multi-line subject → `400`. Content is never evaluated by a template engine; values are inserted as
literal text. A line whose placeholders all render empty is dropped. Missing, inactive or invalid
stored templates fall back to the built-in default.

### Platform management (Super Admin, Phase 9)

No `X-Business-ID`. Business users and Support Admins get `403`. Lists are paginated and support
`search` and `ordering`.

| Method | Path | Permission | Notes |
| --- | --- | --- | --- |
| GET | `/admin/dashboard/?from=&to=&tz=` | `platform.dashboard.view` | Dates `YYYY-MM-DD`, inclusive (default: last 30 days; same maximum as business analytics), `tz` an IANA name (default: server `TIME_ZONE`); bad range or zone → `400`. Returns `range`, `businesses`, `users`, `subscriptions` (`active`, `past_due`, `expiring_soon` (7 days), `cancelling`, `lapsed`, `never_subscribed`), `revenue` (captured, non-test payments paid in the range, one entry per currency: `currency`, `gross`, `tax`, `payments`), `refunds_tracked: false`, `test_payments`, `revenue_series` (`{currencies, months[{month, totals{currency: amount}}]}`, 6 months), `business_growth` (6 months), `content` (catalogues, products, `storage_bytes`), `enquiries`, `support`, `top_plans`, `top_categories`, `expiring`, `recent_businesses`, `recent_payments`, `recent_events` |
| GET | `/admin/system/` | `platform.system.view` | `{ok, checks[{key, label, ok, detail}], config, checked_at}` — checks `database`, `migrations`, `email`, `payments`; `config` holds non-secret settings only (no keys, passwords, hosts or tokens) |
| GET | `/admin/businesses/` · `/{id}/` · `summary/` | `platform.business.view` | Filters `status`, `category`, `subscription=active|past_due|expiring|none`, `plan` (plan name), `created_from`, `created_to`; search name, slug, email, phone, owner name, city; ordering `created_at`, `name`, `product_count`, `storage_bytes`, `subscription_ends_at`. Rows carry owner, plan, subscription status/end, member/catalogue/product/enquiry counts, storage. Detail adds `members`, `subscriptions`, `payments`, `catalogues`, `activity` |
| POST | `/admin/businesses/{id}/suspend/` · `/reactivate/` | `platform.business.manage` | `{reason}` (5–300 chars, required). `409 no_change` if already in that state. Audited (`business.suspended` / `business.reactivated`, reason in metadata); owners get a mandatory notification with the reason |
| GET | `/admin/users/` · `/{id}/` · `summary/` | `platform.user.view` | Filters `platform_role`, `is_active`, `is_email_verified`, `business`; search email, name, phone. Never includes the password hash. Detail adds `memberships`, `platform_permissions`, `activity` |
| PATCH | `/admin/users/{id}/` | `platform.user.manage` | `{is_active?, platform_role?}` (`""` removes the role). Deactivating revokes all refresh tokens. `409 self_change` for your own account; `409 last_super_admin` if it would leave no active Super Admin. Audited as `user.updated` |
| GET | `/admin/catalogues/` · `/{id}/` · `summary/` | `platform.catalogue.view` | Filters `status`, `business`; search name, slug, business name/slug. `public_url` is `null` unless published |
| GET | `/admin/catalogues/{id}/qr/?type=png|svg&tracking=` | `platform.catalogue.view` | Same generator as the business QR endpoint; `404` for unpublished catalogues |
| POST | `/admin/catalogues/{id}/unpublish/` | `platform.catalogue.manage` | Takedown: `{reason}` required; published → draft. `409 not_published` otherwise. Audited (`catalogue.taken_down`); the business's catalogue viewers get a mandatory notification. Content is never edited or deleted |

Suspension effects: members get `403 business_suspended` on business APIs and the business's public
catalogues return `404`. Subscriptions, payments and data are unchanged; reactivation restores access.

### Tenant-context errors

| Situation | Response |
| --- | --- |
| `X-Business-ID` missing | `400 business_header_required` |
| `X-Business-ID` not a UUID | `400 invalid_business_header` |
| Business doesn't exist, or caller has no **active** membership in it | `404 not_found` |
| Business suspended by the platform | `403 business_suspended` |
| Object ID belongs to another business | `404 not_found` |
