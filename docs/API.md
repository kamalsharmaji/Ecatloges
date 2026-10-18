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

### Tenant-context errors

| Situation | Response |
| --- | --- |
| `X-Business-ID` missing | `400 business_header_required` |
| `X-Business-ID` not a UUID | `400 invalid_business_header` |
| Business doesn't exist, or caller has no **active** membership in it | `404 not_found` |
| Business suspended by the platform | `403 business_suspended` |
| Object ID belongs to another business | `404 not_found` |
