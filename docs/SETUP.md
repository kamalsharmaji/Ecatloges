# myEcatalogues — Local Setup (Windows 11 + PowerShell)

## 1. Prerequisites

| Tool | Version used | Notes |
| --- | --- | --- |
| Python | 3.14.x (3.12+ supported) | `python --version` |
| Node.js | 24.x LTS (≥ 20.19 required by Vite 7) | `node --version` |
| npm | 11.x | |
| PostgreSQL | 17 (15+ supported) | native install **or** Docker Desktop |
| Git | 2.4x+ | |

### Installing PostgreSQL

**Option A — Docker Desktop** (also starts Mailpit for emails):

```powershell
docker compose up -d
```

**Option B — native install:**

```powershell
winget install PostgreSQL.PostgreSQL.17
```

Then create the role and database (adjust the path to your install):

```powershell
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -c "CREATE ROLE myecatalogues LOGIN PASSWORD 'myecatalogues' CREATEDB;"
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -c "CREATE DATABASE myecatalogues OWNER myecatalogues;"
```

`CREATEDB` lets the test suite create its throwaway `test_myecatalogues` database.

**Option C — portable binaries, no installer or admin rights** (what was used to validate Phase 3):

```powershell
$pg = "$env:LOCALAPPDATA\pgsql17"
New-Item -ItemType Directory -Force $pg | Out-Null
Invoke-WebRequest https://get.enterprisedb.com/postgresql/postgresql-17.6-1-windows-x64-binaries.zip -OutFile "$pg\pg.zip"
tar -xf "$pg\pg.zip" -C $pg pgsql/bin pgsql/lib pgsql/share      # skip the bundled pgAdmin
& "$pg\pgsql\bin\initdb.exe" -D "$pg\data" -U postgres -A trust -E UTF8 --no-locale
& "$pg\pgsql\bin\pg_ctl.exe" -D "$pg\data" -o "-p 5432 -c listen_addresses=127.0.0.1" -l "$pg\pg.log" start
& "$pg\pgsql\bin\psql.exe" -h 127.0.0.1 -U postgres -c "CREATE ROLE myecatalogues LOGIN PASSWORD 'myecatalogues' CREATEDB;" -c "CREATE DATABASE myecatalogues OWNER myecatalogues;"
# Stop later with: & "$pg\pgsql\bin\pg_ctl.exe" -D "$pg\data" stop
```

`-A trust` is acceptable only for a local, loopback-only development server.

## 2. Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1          # if blocked: Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
python -m pip install --upgrade pip
pip install -r requirements-dev.txt

Copy-Item .env.example .env
# Edit .env: set DJANGO_SECRET_KEY (generate below) and DATABASE_URL.
python -c "import secrets; print(secrets.token_urlsafe(50))"

python manage.py migrate
python manage.py createsuperuser       # becomes the Platform Super Admin
python manage.py runserver             # http://127.0.0.1:8000
```

> **Temporary SQLite fallback.** If PostgreSQL is not running yet you can set
> `DATABASE_URL=sqlite:///db.sqlite3` in `backend/.env` to try the app. PostgreSQL remains the
> supported database — switch back before relying on any data, and run the test suite against
> PostgreSQL before deploying.

Useful URLs: API docs `http://127.0.0.1:8000/api/docs/`, Django admin `http://127.0.0.1:8000/django-admin/`,
health check `http://127.0.0.1:8000/api/v1/health/`.

### Checks and tests

```powershell
python manage.py check
python manage.py makemigrations --check --dry-run   # fails if a model change lacks a migration
python manage.py spectacular --validate --fail-on-warn --file NUL
python -m pytest
```

Run the suite against PostgreSQL (recommended before every merge) without touching `.env`:

```powershell
$env:TEST_DATABASE_URL = "postgres://myecatalogues:myecatalogues@127.0.0.1:5432/myecatalogues"
python -m pytest
Remove-Item Env:TEST_DATABASE_URL
```

Roles and permissions are created automatically by `migrate` (re-running it is safe and
idempotent). After adding a permission to `apps/rbac/registry.py`, just run `python manage.py migrate`.

### Trying the auth flows locally

With the default `EMAIL_BACKEND=django.core.mail.backends.console.EmailBackend`, verification,
password-reset and invitation emails are printed in the `runserver` terminal — copy the link from
there. With Docker's Mailpit, set the SMTP backend in `.env` and open http://localhost:8025.

## 3. Frontend

```powershell
cd frontend
npm install
Copy-Item .env.example .env.local      # optional; defaults work for local development
npm run dev                            # http://localhost:5173
```

Vite proxies `/api` and `/media` to `http://127.0.0.1:8000`, so run the Django server at the same time.

```powershell
npm run build      # type-check + production build into frontend/dist
npm run lint
```

## 4. Resolved dependency versions (Phase 1)

Backend (`pip freeze`, Python 3.14.7): Django 5.2.18 (LTS), djangorestframework 3.16.1,
djangorestframework-simplejwt 5.5.1, drf-spectacular 0.28.0, django-cors-headers 4.9.0,
django-filter 25.2, django-environ 0.12.1, argon2-cffi 25.1.0, psycopg 3.2.13 (binary),
Pillow 11.3.0, qrcode 8.2, reportlab 4.5.1 (Phase 4, invoice PDFs), gunicorn 23.0.0,
pytest 8.4.2, pytest-django 4.14.0.

Frontend (`npm ls --depth=0`): react 19.3.1, react-dom 19.3.1, vite 7.3.7, typescript 5.9.3,
tailwindcss 4.3.3 (+ @tailwindcss/vite), react-router-dom 7.18.4, @tanstack/react-query 5.104.4,
axios 1.20.0, react-hook-form 7.90.0, zod 3.25.76, @hookform/resolvers 5.9.2, lucide-react 0.540.0,
eslint 9.39.5, typescript-eslint 8.71.2.

`requirements.txt` pins each package to its minor line, and `package-lock.json` locks the exact
frontend tree.

## 5. Media storage (Phase 5)

- **Local development:** files are stored under `backend/media/` (or `MEDIA_ROOT`) and served by
  Django at `/media/` only while `DJANGO_DEBUG=True`; Vite proxies `/media` to Django. No extra
  dependency is needed — Pillow (already installed) creates WebP thumbnails and previews.
- **Limits:** `MEDIA_MAX_UPLOAD_MB` (default 100), `MEDIA_MAX_ITEMS_PER_PRODUCT` (20) and
  `MEDIA_MAX_IMAGE_PIXELS` are technical caps; plan limits (`max_image_size_mb`,
  `video_uploads_enabled`, `max_video_size_mb`, `storage_limit_mb`) apply on top.
- **Accepted files:** JPG, PNG, WebP images; MP4 and MOV videos. The type is detected from the file
  content and must match the extension.
- **Optional `ffmpeg`:** not required. Without it, videos are stored and play normally but have no
  poster frame. (Durations are read without ffmpeg.)
- **Local storage limitations:** single disk, no CDN, files served by Django in DEBUG only, access
  control relies on unguessable URLs, and backups are your responsibility. For production use an
  S3-compatible bucket (private, signed URLs, CDN in front) — configured in Phase 15 via
  `django-storages`. Upload request size must also be allowed by the reverse proxy
  (e.g. nginx `client_max_body_size 110m;`).
- **Public catalogue links** are SPA routes (`/c/<business>/<catalogue>`): the production web server
  must serve `index.html` for unknown paths so they work on refresh (Vite does this in development).

## 6. Payments & billing

### Local development (mock gateway — no real money)

```powershell
cd backend
python manage.py seed_dev_plans          # "[DEV]" placeholder plans; refuses to run without the mock gateway
python manage.py createsuperuser         # Platform Super Admin → /admin in the SPA
```

Flow to try: register → open the verification link printed in the `runserver` console → create
a business → choose a plan → on the payment page use **Development payment simulator**. The
simulator posts a correctly signed webhook through the real verification pipeline; nothing is
activated from the browser directly.

Housekeeping commands (schedule every 5–15 minutes in production with cron or Windows Task Scheduler):

```powershell
python manage.py sync_subscriptions      # apply period ends, expiries, scheduled changes, expiry reminders
python manage.py reconcile_payments      # ask the gateway about recent open/failed payments
python manage.py publish_announcements   # publish scheduled announcements (every 1–5 minutes)
```

### Before accepting real payments (external setup still required)

1. **Approve commercial data:** real plan prices, limits, grace period (`SUBSCRIPTION_GRACE_DAYS`),
   renewal window, upgrade/downgrade/refund policy. Create plans in Super Admin → Plans & pricing;
   deactivate/delete the `[DEV]` plans.
2. **Approve tax treatment with your accountant:** `BILLING_TAX_RATE`, `BILLING_TAX_NAME`,
   `BILLING_PRICES_INCLUDE_TAX`, seller details (`BILLING_SELLER_*`, incl. tax registration id).
   The invoice layout has not been reviewed for statutory requirements (e.g. GST invoice rules).
3. **Choose a gateway.** For Razorpay (adapter prepared, *not yet verified*):
   - Create a Razorpay account; use **Test Mode** keys first.
   - Set `PAYMENT_PROVIDER=razorpay`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`.
   - Dashboard → Webhooks: URL `https://<api-host>/api/v1/billing/webhooks/razorpay/`, events
     `payment.captured`, `payment.failed`, `order.paid`; put its secret in `PAYMENT_WEBHOOK_SECRET`.
   - Run the full flow in test mode: success, failure, duplicate webhook, dismissed checkout,
     reconciliation. Only then switch to live keys.
   - Another gateway = a new class implementing `apps/billing/providers/base.PaymentProvider`
     registered in `providers/__init__.py`.
4. Production settings refuse `PAYMENT_PROVIDER=mock` / `PAYMENT_MOCK_ENABLED`, and
   `manage.py check` errors if the provider's secrets are missing (`billing.E001`–`E004`).

### Frontend tests

```powershell
cd frontend
npm test            # Vitest unit tests
```

## 6b. Enquiries, QR codes & analytics (Phase 6)

No new dependencies or services: QR codes use `qrcode` + Pillow (already installed) and analytics
is stored in PostgreSQL. Run `python manage.py migrate` to create the `enquiries` and `analytics` tables.

- **Try it locally:** publish a catalogue, open its public link (`/c/<business>/<catalogue>`),
  click **Enquire Now** and submit the form. The business's notification email appears in the
  `runserver` console; the enquiry shows under **Enquiries** with a matching **Customer**.
  Add `?src=qr` to the link to simulate a QR scan.
- **Analytics needs a plan with analytics.** `[DEV] Basic` does not include it (the page shows an
  upgrade notice); `[DEV] Standard` and `[DEV] Premium` do. Views are counted only from a real
  browser User-Agent — `curl`/scripts and link-preview bots are ignored by design — and the same
  browser is counted once per 30 minutes per catalogue/product, so refreshing does not inflate numbers.
- **Settings:** `THROTTLE_PUBLIC_ENQUIRY` (default `5/min` per IP) and `THROTTLE_PUBLIC_VIEW`
  (`120/min`, also covers view beacons and the public QR image). Notification emails go to the
  business email address through the normal `EMAIL_BACKEND`.
- **Behind a reverse proxy:** throttles key on the client IP. Make sure the proxy passes the real
  client address (and configure DRF `NUM_PROXIES` accordingly in Phase 15); otherwise all visitors
  share one limit.
- **`DJANGO_SECRET_KEY`** also keys the anonymous visitor hash: rotating it keeps all counts but
  restarts "unique visitor" continuity.
- **Printing QR codes:** download the PNG (1200 px) or SVG from **QR Codes**. The code points to
  the catalogue's public URL, so changing the business or catalogue slug invalidates printed codes.

## 6c. Notifications, activity log & support (Phase 7)

No new dependencies, services or background workers. Run `python manage.py migrate` to create the
`audit_logs`, `notifications` and `support` tables.

- **In-app notifications** are created synchronously with the change that causes them; the UI polls
  every 60 seconds. Existing emails are unchanged. Support replies and resolutions now also email the
  requester (via `EMAIL_BACKEND`; in development they appear in the `runserver` console).
- **Expiry reminders:** `python manage.py sync_subscriptions` now also creates a one-per-period
  "plan ends soon" notification `SUBSCRIPTION_REMINDER_DAYS` days before an active period ends
  (default `7`, operational setting). Keep scheduling the command every 5–15 minutes as before.
- **Support Admin access:** set a user's *Platform role* to "Platform Support Admin" in Django admin
  (`/django-admin/`). They get the Support Tickets screen in `/admin` (all businesses) and the billing
  view screens, but not the audit log, which is Super Admin only.
- **Try it locally:** as a business owner open **Help & Support → Create Ticket**; as a Support Admin
  open `/admin/support`, add an internal note and a reply; the owner sees the reply (not the note), a
  bell notification and an email in the console. Activity appears under **Activity Log**
  (owners and roles with "View activity log").
- **Audit entries cannot be edited or deleted** through the app or Django admin. Retention/archiving
  is a deployment decision (Phase 15); plan for table growth (roughly one row per change).

## 6d. Settings, email templates & announcements (Phase 8)

No new dependencies or environment variables. Run `python manage.py migrate` (adds business settings
fields and the preference, email-template and announcement tables — existing data is untouched and
users start with default preferences).

- **Scheduled task (new):** `python manage.py publish_announcements` publishes announcements whose
  start time has arrived. Schedule it every 1–5 minutes next to `sync_subscriptions`. It is safe to run
  repeatedly or concurrently; each announcement is delivered at most once. Without it, announcements
  with a future start time stay "scheduled".
- **Email delivery:** all emails use `EMAIL_BACKEND` / `DEFAULT_FROM_EMAIL` as before. In development
  the console backend prints them in the `runserver` terminal — including **Send test** from Email
  Templates, which only ever goes to the signed-in Super Admin's own address. For real delivery set an
  SMTP backend (`EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`, `EMAIL_USE_TLS`)
  in the environment; these are never shown in the admin UI or API. Automated tests use Django's
  in-memory outbox and never send real mail.
- **Announcement emails** go only to recipients who switched on "Product announcements → Email"
  (off by default) and are sent synchronously after publishing; for very large audiences a task queue
  is recommended before enabling `send_email`.
- **Who can do what:** Email Templates and Announcements are Super Admin only. Branding and catalogue
  defaults need the business permission "Update business settings" (Owner, Business Admin).

## 6e. Super Admin platform management (Phase 9)

No new dependencies, services or environment variables. Run `python manage.py migrate` — the only
migration is `billing 0002_payment_paid_index` (adds an index on payments; no data changes).

- **Access:** the new screens (Dashboard, Businesses, Users & Roles, Catalogues, Domains & QR, System
  Settings) are Super Admin only. Support Admins keep Support Tickets and the billing view screens.
  For Super Admins, `/admin` now opens the Dashboard.
- **Suspending a business** blocks its team and takes its public catalogues offline until it is
  reactivated. Nothing is deleted and billing is unaffected. Both actions need a reason and are in
  Audit Logs.
- **Deactivating a user** signs them out everywhere. You cannot change your own account, and the
  system keeps at least one active Super Admin. To bootstrap or recover a Super Admin, use
  `python manage.py createsuperuser` (or Django admin) on the server.
- **Revenue on the dashboard** counts only verified, non-test payments, per currency. With the mock
  gateway every payment is a test payment, so revenue shows zero and test payments are listed
  separately — this is expected. Refunds are not tracked yet.
- **System Settings** is read-only; change configuration through environment variables and restart.

### Custom domains (not implemented — infrastructure required)

Catalogues are reachable only at `FRONTEND_URL/c/<business>/<catalogue>`. Supporting
`catalogue.customer-domain.com` would require, outside the app:

1. A DNS record per customer domain (CNAME to the platform host) and an ownership check (TXT record).
2. TLS certificates per domain (e.g. a reverse proxy with on-demand ACME/Let's Encrypt, or a CDN that
   issues certificates).
3. Host-based routing in the web server and API, plus `ALLOWED_HOSTS`/CORS/CSRF handling for each host.
4. A domain model, verification flow and admin screen in the app (future phase).

Until then the admin "Domains & QR" page offers public links and QR codes only.

### Backup & recovery

Backups are an infrastructure task; the app has no backup or restore button by design. Back up **both**
the PostgreSQL database and the media storage (`MEDIA_ROOT` locally, or the S3 bucket in production).
Credentials come from the environment or a `.pgpass` file — never put them in scripts or source code.

```powershell
# Backup (compressed custom format; safe to run while the app is live)
pg_dump --format=custom --no-owner --file "myecatalogues-$(Get-Date -Format yyyyMMdd-HHmm).dump" `
        --host <db-host> --port 5432 --username <db-user> <db-name>
# Media (local storage): copy the folder; for S3 enable bucket versioning or sync to a second bucket
robocopy backend\media <backup-folder>\media /MIR
```

Recovery — **always restore into a new, empty database first**, never over the live one:

```powershell
createdb --host <db-host> --username <db-user> myecatalogues_restore
pg_restore --no-owner --dbname myecatalogues_restore --host <db-host> --username <db-user> <file>.dump
```

Point a test instance's `DATABASE_URL` at `myecatalogues_restore`, run `python manage.py migrate`
(applies only migrations newer than the backup) and `python manage.py check`, verify sign-in and a few
catalogues, and only then switch production over during a maintenance window. Restore the media files
from the same point in time. Test the restore regularly; an untested backup is not a backup.
Scheduling, retention and off-site copies are part of the production setup (Phase 15).

## 7. Production

Production deployment (gunicorn, nginx, S3-compatible media storage, environment variables,
migrations, static files, backups) is documented in Phase 15. In short: set
`DJANGO_SETTINGS_MODULE=config.settings.prod`, provide every secret through the environment,
run `python manage.py check --deploy`, and never use the mock payment provider.
