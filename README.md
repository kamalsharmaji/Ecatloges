# myEcatalogues

Multi-tenant SaaS for business owners, retailers, wholesalers and manufacturers to build
digital product catalogues, share them by link and QR code, receive customer enquiries and track
catalogue analytics.

- **Backend:** Django 5.2 LTS · Django REST Framework · Simple JWT · PostgreSQL · drf-spectacular
- **Frontend:** React 19 · Vite 7 · TypeScript · Tailwind CSS 4 · TanStack Query · React Router · React Hook Form + Zod

## Quick start (Windows PowerShell)

```powershell
# 1. Database (Docker Desktop) — or install PostgreSQL natively, see docs/SETUP.md
docker compose up -d

# 2. Backend
cd backend
python -m venv .venv; .\.venv\Scripts\Activate.ps1
pip install -r requirements-dev.txt
Copy-Item .env.example .env            # then set DJANGO_SECRET_KEY
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver

# 3. Frontend (new terminal)
cd frontend
npm install
npm run dev                            # http://localhost:5173
```

## Documentation

- [docs/SETUP.md](docs/SETUP.md) — full local setup, tests, dependency versions
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — system design, tenancy, RBAC, media, billing
- [docs/DATABASE.md](docs/DATABASE.md) — tables, relationships, constraints
- [docs/API.md](docs/API.md) — API conventions and examples (live docs at `/api/docs/`)

## Project status

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | Repository and environment setup | ✅ done |
| 2 | Django configuration, custom user model, migrations | ✅ done |
| 3 | Auth, businesses, memberships, tenant isolation, RBAC (+ auth/onboarding/team/roles UI) | ✅ done |
| 4 | Subscription plans, billing, payment abstraction, invoices (+ billing & Super Admin UI) | ✅ done (mock gateway; real gateway pending) |
| 5 | Catalogues, categories, products, media library, public catalogue (+ UI from the PDF designs) | ✅ done (see docs/ui-implementation-checklist.md) |
| 6–7 | Enquiries, customers, QR codes, analytics; remaining media work | ⏳ next |
| 8–15 | Notifications, support, audit logs, panels, hardening, deployment | planned |

UI screens are tracked against the design PDF in [docs/ui-implementation-checklist.md](docs/ui-implementation-checklist.md).

## Known limitations (current)

- No permanent PostgreSQL on the original dev machine: the local `.env` uses SQLite for day-to-day
  runs. The Phase 3 suite was also run against PostgreSQL 17.6 (portable binaries, docs/SETUP.md option C).
- The terms-and-conditions page is a placeholder until legal text is provided.
- Changing a user's email address is not supported yet (requires re-verification flow).
- Audit-log records for membership/role/billing admin actions arrive with the `audit_logs` app
  (Phase 8); until then those actions are written to the structured application log.
- **Real payments are not enabled.** Only the mock gateway (dev/tests) works end to end. The
  Razorpay adapter is prepared but unverified; plans in the database are `[DEV]` placeholders;
  tax is off. See docs/SETUP.md §5 for the external setup required.
- No proration on upgrades and no automatic refunds; flagged payments are resolved manually.
