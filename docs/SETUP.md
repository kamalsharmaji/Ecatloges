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
Pillow 11.3.0, qrcode 8.2, gunicorn 23.0.0, pytest 8.4.2, pytest-django 4.14.0.

Frontend (`npm ls --depth=0`): react 19.3.1, react-dom 19.3.1, vite 7.3.7, typescript 5.9.3,
tailwindcss 4.3.3 (+ @tailwindcss/vite), react-router-dom 7.18.4, @tanstack/react-query 5.104.4,
axios 1.20.0, react-hook-form 7.90.0, zod 3.25.76, @hookform/resolvers 5.9.2, lucide-react 0.540.0,
eslint 9.39.5, typescript-eslint 8.71.2.

`requirements.txt` pins each package to its minor line, and `package-lock.json` locks the exact
frontend tree.

## 5. Production

Production deployment (gunicorn, nginx, S3-compatible media storage, environment variables,
migrations, static files, backups) is documented in Phase 15. In short: set
`DJANGO_SETTINGS_MODULE=config.settings.prod`, provide every secret through the environment,
run `python manage.py check --deploy`, and never use the mock payment provider.
