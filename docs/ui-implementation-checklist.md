# UI Implementation Checklist (source: `myEcatalogues_All_UI_Screens.pdf`)

Reference file: `C:\Users\Administrator\Downloads\myEcatalogues_All_UI_Screens.pdf` — 39 pages,
1 cover + 2 index pages + 36 screenshot pages (1536×1024 desktop renders; several include
mobile variants). Analysed 2026-10-18.

> **Important:** the page *titles* in the PDF do not always match the screenshot on that page.
> This checklist maps screens by **what the screenshot shows**. The index lists 38 screens; only
> 29 distinct screens are actually pictured (some twice). Screens with no screenshot are marked
> "no design" and will be built from the written requirements in the matching phase.

Status legend: ✅ implemented · 🟡 partial (see notes) · ⏳ pending (phase noted) · ➖ no design in PDF

## Global layout & visual language (applies everywhere)

- Left sidebar (white, rounded active pill in brand blue), "Upgrade" promo card at the bottom.
- Top bar: global search (Ctrl+K), notifications bell, help icon, user menu with role subtitle.
- Each panel page: **hero banner** (light-blue gradient, page icon tile, title, 2-line description,
  illustration, 4-item ✓ checklist, primary CTA top-right), then a row of 4–6 **stat cards**
  (icon tile, label, value, trend), then a **toolbar** (search, 2–4 dropdown filters, sort, view
  toggle), then a grid of cards or a table with pagination ("Showing 1 to N of M …").
- Status pills: Published (green), Draft (blue), Inactive/Archived (red/grey).
- Side panels on the right for create/edit/detail (categories, invoices, enquiries, users…).

| Element | Status | Notes |
| --- | --- | --- |
| Sidebar + header shell | ✅ (UI fidelity pass) — see `ui-visual-fidelity-audit.md`; earlier notes: | Exists since Phase 3; Phase 5 adds catalogue/product/category/media nav and PDF-style hero/stat/toolbar components; Phase 6 adds Enquiries (with "new" badge), Analytics, QR Codes, Customers. Phase 7 adds the **notifications bell** (unread badge + latest 6) in both panels, and Notifications (badge), Activity Log, Help & Support nav items. Phase 8 adds **Settings** (replacing Business profile / My account in the nav), the announcement banner, and Announcements / Email Templates in the admin nav. Global search and the help icon ⏳ Phase 12. |
| Hero banner, stat cards, toolbar, grid/list toggle, ⋯ action menu, status pills, toasts | ✅ Phase 5 | `frontend/src/components/panel/` + `components/ui/ToastProvider.tsx`. Applied to Catalogues, Products, Categories, Media Library, Dashboard; older Phase 3–4 pages still use the simpler header ⏳ Phase 10. |
| "Upgrade" sidebar card | ✅ UI fidelity pass | Shows the next plan up from the live plan list; "Platform Management" card in the admin panel. |

## Business Owner Panel

| # | Screen (as pictured) | PDF page(s) (label printed on page) | Status | Phase | Notes |
| --- | --- | --- | --- | --- | --- |
| B1 | Landing page | p4 ("01 Landing") + separate landing reference (2026-10-19) | ✅ | 9 | Rebuilt to the landing reference: header with menu, hero with phone mockup and floating cards, business-type strip, 6 features, How It Works, multi-device showcase with QR card, stats bar, industries, pricing (monthly/yearly toggle), testimonials, FAQ accordion, CTA banner, footer. Copy and figures live in `frontend/src/features/landing/content.ts`; **stats, prices and testimonials are sample content shown only in development** until `approved: true` is set there. Yearly prices/discount not supplied → yearly view says "Yearly price shown at checkout". Footer items without a page (About, Privacy, Refund, social profiles) render unlinked. Photos: Unsplash (see `src/assets/landing/CREDITS.md`). Screenshots checked in headless Chrome at 1440/1024/768/390/360 px. |
| B2 | Registration & payment flow (account → verify → business → plan → order summary → payment → processing/failed → success) | p5 ("02") | 🟡 | 3–4 | All steps work. Differences: verification is a link not a 6-digit code; no WhatsApp verify; payment step is mock/Razorpay-prepared; GSTIN field ⏳ (tax config pending). |
| B3 | Business profile setup wizard (details → branding → contact → review) with logo upload & preview | p28 ("26 Plans & Pricing") | 🟡 | 3/10 | Single-step business form exists; logo, sub-category, multi-step wizard ⏳ Phase 10. |
| B4 | Login (email / mobile tabs, social login) | p6 ("03 Login") | 🟡 | 3 | Email login done. Mobile-number login and Google/Microsoft SSO not in agreed scope. |
| B5 | Dashboard (3 variants incl. mobile) | p7 ("04"), p12 ("09 Enquiries"), p32 ("30 Analytics") | 🟡 Phase 6 | 5/6/10 | Done: welcome hero; catalogues, products, catalogue views (last 30 days) and enquiries stat cards; views & enquiries trend (plans with analytics, upsell otherwise); recent enquiries; recent catalogues; quick actions. Pending ⏳ Phase 10: share card with QR on the dashboard, subscription usage card. |
| B6 | **Catalogues** list (hero, 4 stats, search/status/category/sort, grid+list, card actions Edit/View/Share, ⋯ menu, pagination) | p8 ("05") | 🟡 Phase 5 | 5 | Done: hero, stats (total/published/drafts/archived + plan limit), search, status & category filters, sort, grid+list, cover cards, ⋯ menu (publish/unpublish/copy link/archive/restore/delete), Edit/View/Share, pagination, confirmations. Phase 6: all-time views/enquiries on cards and table, sort by views/enquiries, QR preview & download in the share dialog. "Total views" stat card: shown on Dashboard/Analytics instead. |
| B7 | Catalogue create/edit (details, branding, products & ordering) | ➖ (no design) | ✅ Phase 5 | 5 | Details, link name, tagline, cover & logo from media library, brand colour, WhatsApp/contact, show prices; products tab with add/remove and drag-and-drop ordering (plus keyboard up/down). |
| B8 | **Products** list (hero, stats, search name/SKU, catalogue/category/status filters, sort, table with thumbnails, catalogue thumbs, status, bulk actions, pagination) | p9 ("06") | ✅ Phase 6 | 5/6 | Done: everything incl. Views and Enquiries columns and sorting (Phase 6). "Inactive" in the PDF = **Archived** status. Bulk actions: publish, unpublish, add/remove catalogue, archive, restore, delete. |
| B9 | **Add/Edit Product** (images & videos with drag-reorder + Main, add from library, details, category path, tags, highlights, status radio, featured, pricing & inventory, actions Preview/Duplicate/Save as Draft/Update) | p26 ("24 Payments"), p35 ("34 Audit Logs") | 🟡 Phase 5 | 5 | Done: all of the above. Pending: brand, variants, specifications, SEO fields, schedule-for-later, rich-text editor (plain multi-line text used), live preview carousel. |
| B10 | **Categories** (hero, 4 stats, search/status/sort, card grid with image, icon, product & subcategory counts, status; right "Create New Category" panel: name, description, image upload, icon picker, parent, status) | p10 ("07") | ✅ Phase 5 | 5 | Delete asks where to move products; categories with subcategories can't be deleted. "Inactive" category status not modelled (Published/Draft only). |
| B11 | **Media Library** (hero, 4 stats incl. storage used/limit, search/folder/type/sort, grid with selection, video duration badge, upload dropzone, folders with counts, bulk move/delete) | p19 ("17 Add/Edit Product") | 🟡 Phase 5 | 5 | Fixed system folders (no custom folders yet); tags & bulk download ⏳; video duration requires ffmpeg (optional). |
| B12 | **Public Catalogue** (desktop + mobile: header search, hero, trust strip, shop by category, featured products with category tabs, product cards with price/MOQ, enquiry form, share sheet with QR) | p18 ("16") | ✅ Phase 6 | 5/6 | Done: branding, hero, categories, search, category tabs, product grid & detail, **enquiry form** (general + per product; honeypot, timing check, idempotency key, rate limit), WhatsApp as secondary option, **share sheet with QR**, copy link, native share; view beacons (catalogue + product). Ratings, trust strip and wishlist hearts not in scope. |
| B13 | Enquiries (stats, filters, table with source & status, detail side panel, reply on WhatsApp/email) | p16 ("13 Subscription"), p34 ("33 Announcements") | ✅ Phase 6 | 6 | 5 status stats, search, status/source/catalogue/date filters, table with source & status, bulk status/delete, detail side panel (`?enquiry=` deep link) with status change, internal notes, call/WhatsApp/email actions, link to customer. "Budget" field from the PDF not modelled (quantity only). |
| B14 | Analytics (views/enquiries trend, top catalogues/products, traffic, devices, locations) | p31 ("29 Enquiries & Leads") | 🟡 Phase 6 | 6 | Date range (7/30/90 days, month, custom), 4 KPIs vs previous period, trend charts (views and enquiries as two single-axis charts, with table view), top catalogues/products, traffic sources, devices, enquiries by status, recent enquiries. **Locations omitted by design** (no IP storage). Gated by plan flag `analytics_enabled` + `analytics.view`. |
| B15 | QR Codes (business) | ➖ index #11 only | ✅ Phase 6 | 6 | Built without design: QR per published catalogue, PNG/SVG download, copy link, WhatsApp share, QR-visit count (30 days). |
| B16 | Customers | ➖ index #12 only | ✅ Phase 6 | 6 | Built without design: stats, search, "has open enquiries" filter, table, detail panel with enquiry history, create/edit form, delete that keeps enquiries. |
| B17 | Subscription plans & current subscription | p17 ("14 Invoices") | ✅ Phase 4 | 4 | Plan comparison table side panel ⏳ polish. |
| B18 | Invoices (table + detail side panel, download PDF) | p14 ("11 QR Codes") | ✅ Phase 4 | 4 | PDF shows multi-business/"Generate Invoice" admin-style controls; owner view shows own invoices only (tenant rule). |
| B19 | Settings (tabs: profile, branding, domain & SEO, payment, email templates, catalogue, staff, notifications; business hours, social links) | p15 ("12 Customers") | 🟡 Phase 8 | 8 | `/app/settings` tabs: **Business Profile** (profile form, social links, business preview card with live catalogue link), **Branding & Design** (logo from media library, brand colour with preview), **Catalogue Settings** (defaults for new catalogues + "email new enquiries to the business" switch), **Staff & Permissions** (links), **Notifications** (per-user in-app/email preferences, mandatory ones locked), **Account & Billing** (links). Not built (no backing feature): Domain & SEO, Payment Settings, per-business email templates, business hours, GST/PAN fields, business tags, default currency (billing currency is platform-wide). Sidebar "Business profile" and "My account" items replaced by **Settings** (routes still work). |
| B20 | Team Members (stats, table, branch, detail panel with module access) | p21 ("19 Staff Management & Roles") | 🟡 Phase 3 | 3/10 | Members, roles, invitations done; branches & PDF styling ⏳. |
| B21 | Notifications & Activity Log | p13 ("10 Analytics") | 🟡 Phase 7 | 7 | `/app/notifications`: hero with Mark all as read, 5 per-type stat cards (unread + today), type tabs with counts, search, read/unread and period filters, list with unread dot, level badge and ⋯ menu (read/unread/delete), pagination, detail panel (`?notification=`) with enquiry details + Reply/View Customer, the item's activity trail, mark read/unread, delete. `/app/activity`: full Activity Log (filters: area, action, person, dates, search). "Notification Settings" button → Settings → Notifications (Phase 8). Announcements appear here and as a dismissible banner (Phase 8). "Product Out of Stock" alerts need inventory tracking (not in scope). |
| B22 | Help & Support | ➖ index #18 only | ✅ Phase 7 | 7 | Built without design: status stats & tabs, search by ticket ID/subject, category filter, "only me" filter, create-ticket modal (idempotent), detail panel with conversation, reply, close/reopen. Attachments ⏳ (not in scope yet). |

## Super Admin Panel

| # | Screen (as pictured) | PDF page(s) | Status | Phase | Notes |
| --- | --- | --- | --- | --- | --- |
| A1 | Dashboard | p24 ("22 Businesses") | ✅ Phase 9 | 9 | `/admin/dashboard` (also the `/admin` landing page): KPI cards (businesses, users, active/past-due/expiring subscriptions, verified revenue per currency, catalogues, products, enquiries, open tickets, storage), 6-month revenue and business-growth charts, top plans and categories, expiring subscriptions, recent businesses/payments/events. Date range + browser timezone. All numbers are database aggregates; test (mock) payments are counted separately and never as revenue; refunds are not tracked and the page says so. |
| A2 | Businesses | p27 ("25 Users & Roles") | ✅ Phase 9 | 9 | `/admin/businesses` (`?business=<id>`): 6 stat cards, tabs (all / active plan / expiring / no plan / suspended), search (name, slug, email, phone, owner, city), plan filter, sort, table with owner, plan, status, dates, users, products; detail panel with contact, usage (catalogues, products, enquiries, storage), team, subscription history, recent payments, catalogues, activity; suspend / reactivate with a required reason (audited, owner notified, reversible). No editing of business content. |
| A3 | Subscriptions Management | p25 ("23"), p36 ("35") | 🟡 Phase 4 | 4/11 | List, filters, cancel done; charts, detail panel, renew/suspend ⏳. |
| A4 | Payments | ➖ index #24 only | ✅ Phase 4 | 4 | Built without design. |
| A5 | Users & Roles | p22 ("20 Notifications") | ✅ Phase 9 | 9 | `/admin/users` (`?user=<id>`): stat cards, filters (platform role, active, email verified, business), search; detail panel with memberships, derived platform permissions, recent activity; activate/deactivate (signs the user out everywhere) and platform-role change, with confirmation. You cannot change your own account, and the last active Super Admin cannot be removed or demoted. Roles are fixed in code (no custom role editor) — see ARCHITECTURE.md. |
| A6 | Plans & Pricing | p23 ("21 Dashboard") | 🟡 Phase 4 | 4/11 | CRUD done; card grid, popular flag, duplicate ⏳. |
| A7 | Catalogues Management (platform-wide) | p29 ("27") | ✅ Phase 9 | 9 | `/admin/catalogues` (`?catalogue=<id>`): stat cards, status tabs, search (name, business), business filter, table with product count, views, enquiries; detail with public link (published only) and QR; takedown (unpublish to draft) with a required reason — audited and the business is notified. Admins cannot edit or delete catalogue content. |
| A8 | Domains & QR | p30 ("28") | 🟡 Phase 9 | 9 | `/admin/domains-qr`: every published catalogue's public link, copy, QR preview and PNG/SVG download (reuses `apps/catalogues/qr.py`). **Custom domains are not implemented** and the page says so; they need DNS, TLS and host routing (see SETUP.md). |
| A9 | Enquiries & Leads | ➖ | 🟡 Phase 9 | 9 | Platform-wide enquiry counts (total, new, by status) on the dashboard only. No cross-business list of enquiries, by design: it would expose customer contact data to platform staff. |
| A10 | Analytics | ➖ | 🟡 Phase 9 | 9 | Dashboard revenue and business-growth series, top plans and categories. No separate platform analytics page (views/visitors across businesses). |
| A11 | Support Tickets | p20 ("18 Help & Support"), p33 ("31") | 🟡 Phase 7 | 7 | `/admin/support`: 6 status stats, status tabs, search (ticket ID, subject, business, email), category/priority/assignee filters, reset, table (business, customer, category, priority, status, dates), detail panel with category/priority/status/assignee controls, conversation, Reply / Internal Note tabs with optional status change, Tickets by Category / by Status (labelled bar lists instead of the PDF's donuts). Pending: Export, Ticket Settings, staff-created tickets ("Create Ticket"), attachments, bulk selection. |
| A12 | System Settings | ➖ (index #32, page missing) | 🟡 Phase 9 | 9 | `/admin/system`: read-only health checks (database, unapplied migrations, email backend, payment provider mode) and non-secret configuration (debug flag, time zone, frontend URL, billing currency, grace and reminder days, upload limit, throttle rates, Python/Django versions). No values can be edited from the UI; configuration stays in environment variables. |
| A13 | Announcements | ➖ | ✅ Phase 8 | 8 | Built without design: `/admin/announcements` — list with search/status/audience filters, editor (title, message, style, audience incl. business picker, start/end in the browser's timezone, opt-in email), live recipient count, preview, publish/schedule confirmation, unpublish, archive. Banner in both panels. |
| A14 | Audit Logs | ➖ | ✅ Phase 7 | 7 | Built without design: `/admin/audit-logs` (Super Admin only) — scope, area, action, date filters, search incl. business and request ID. |
| A15 | Email & Notification Templates | ➖ | ✅ Phase 8 | 8 | Built without design: `/admin/email-templates` — grouped list, editor with clickable allowlisted variables, live server-rendered preview with sample data, "use this version" switch, save, send test to yourself, reset to default. In-app notification texts are not editable (generated in code). |
| A16 | Media & Storage Management | p11 ("08 Media Library"), p37 ("36") | 🟡 Phase 9 | 9 | Total storage on the dashboard and storage per business in the Businesses list/detail. No platform-wide media browser or clean-up tools. |
| A17 | Admin Profile & Security | p38 ("37") | 🟡 Phase 9 | 9 | `/admin/profile`: name/phone and password change (same forms as the business panel). Pending: two-factor authentication, active-session list, login history. |
| A18 | Backup & Recovery | p39 ("38") | ⏳ | 15 | Documentation only: the `pg_dump`/`pg_restore` + media procedure in SETUP.md, linked from System Settings. No in-app backup or restore (deliberately — restores are destructive). |

## Phase 5 screen → feature mapping

| Screen | Backend | Frontend route |
| --- | --- | --- |
| Catalogues list | `GET/POST /api/v1/catalogues/`, `…/summary/`, `…/{id}/publish|unpublish|archive|restore/` | `/app/catalogues` |
| Catalogue editor | `GET/PATCH/DELETE /api/v1/catalogues/{id}/`, `…/{id}/items/` (+ `reorder/`) | `/app/catalogues/new`, `/app/catalogues/:id` |
| Products list | `GET /api/v1/products/` (+ filters), `POST /api/v1/products/bulk/`, `…/summary/` | `/app/products` |
| Add/Edit product | `POST/PATCH /api/v1/products/`, `…/{id}/publish|unpublish|archive|duplicate/` | `/app/products/new`, `/app/products/:id` |
| Categories | `GET/POST/PATCH/DELETE /api/v1/categories/` (`?reassign_to=`) | `/app/categories` |
| Media library | `GET/POST/PATCH/DELETE /api/v1/media/`, `…/usage/`, `…/bulk/` | `/app/media` |
| Public catalogue | `GET /api/v1/public/catalogues/{business}/{catalogue}/` (+ `products/`, `products/{id}/`) | `/c/:businessSlug/:catalogueSlug` |

## Phase 5 verification record (2026-10-18)

- Backend: 251 passed + 2 skipped on SQLite; **253 passed on PostgreSQL 17.6** (incl. concurrent
  limit tests). Schema validation: 0 warnings. Migrations: `media_library 0001`, `products 0001`,
  `catalogues 0001–0003`.
- Frontend: `npm test` (Vitest) 8 passed; `npm run lint` clean; `npm run build` OK.
- Live HTTP smoke test via the Vite proxy against PostgreSQL: 31/31 checks.
- **Not verified visually:** no browser automation was available in the build session. Screens were
  built from the PDF screenshots but have not been clicked through in a browser yet.

## Phase 6 screen → feature mapping

| Screen | Backend | Frontend route |
| --- | --- | --- |
| Enquiries | `GET /api/v1/enquiries/` (+ filters), `GET/PATCH/DELETE …/{id}/`, `…/summary/`, `POST …/bulk/` | `/app/enquiries` (`?enquiry=<id>` opens the panel) |
| Customers | `GET/POST /api/v1/customers/`, `GET/PATCH/DELETE …/{id}/`, `…/summary/` | `/app/customers` (`?customer=<id>`) |
| QR Codes | `GET /api/v1/catalogues/{id}/qr/?type=png|svg&size=&tracking=&color=` | `/app/qr-codes`, Share dialog on Catalogues |
| Analytics | `GET /api/v1/analytics/overview/?from=&to=&tz=` | `/app/analytics`, Dashboard |
| Public enquiry / views / QR | `POST /api/v1/public/catalogues/{b}/{c}/enquiries/`, `POST …/events/`, `GET …/qr.svg` | `/c/:businessSlug/:catalogueSlug` |

## Phase 6 verification record (2026-10-18)

- Backend: 307 passed + 2 skipped on SQLite; **309 passed on PostgreSQL 17.6**. `check`, `makemigrations --check`
  and `spectacular --validate --fail-on-warn` clean. New migrations: `enquiries 0001`, `analytics 0001`.
- Frontend: Vitest 16 passed; lint clean; build OK (lead pages code-split).
- Live HTTP smoke test against PostgreSQL: 47/47 checks (QR, enquiry anti-spam/idempotency, customer
  matching, status lifecycle, analytics dedup/bot filtering/timezone/range validation, plan gating,
  cross-business isolation, no contact data in application logs).
- **Not verified visually:** no browser automation was available; screens have not been clicked through.

## Phase 7 screen → feature mapping

| Screen | Backend | Frontend route |
| --- | --- | --- |
| Notifications (+ header bell) | `GET /api/v1/notifications/` (+ `summary/`), `POST …/{id}/read|unread/`, `POST …/read-all/`, `DELETE …/{id}/` | `/app/notifications` (`?notification=<id>`), bell in both panels |
| Activity Log | `GET /api/v1/activity/` (+ `filters/`) | `/app/activity` |
| Help & Support | `GET/POST /api/v1/support/tickets/`, `…/{id}/`, `…/{id}/reply/`, `…/{id}/status/`, `…/summary/` | `/app/support` (`?ticket=<id>`) |
| Support Tickets (Super/Support Admin) | `GET /api/v1/admin/support/tickets/` (+ `summary/`, `agents/`), `PATCH …/{id}/`, `POST …/{id}/reply/`, `…/{id}/status/` | `/admin/support` (`?ticket=<id>`) |
| Audit Logs (Super Admin) | `GET /api/v1/admin/audit-logs/` (+ `filters/`) | `/admin/audit-logs` |

## Phase 7 verification record (2026-10-19)

- Backend: 347 passed + 2 skipped on SQLite; **349 passed on PostgreSQL 17.6**. `check`,
  `makemigrations --check` and `spectacular --validate --fail-on-warn` clean. New migrations:
  `audit_logs 0001`, `notifications 0001`, `support 0001` (applied to the SQLite and PostgreSQL dev databases).
- Frontend: Vitest 22 passed; lint clean; build OK (admin pages now code-split; main chunk 495 kB).
- Live HTTP smoke test against PostgreSQL: 45/45 checks (notification dedup and privacy, read/unread,
  activity entries without contact data, ticket lifecycle with internal notes and emails, cross-business
  and cross-user isolation, Support Admin vs Super Admin permissions, no passwords or ticket text in logs).
- **Not verified visually:** no browser automation was available; screens have not been clicked through.

## Phase 8 screen → feature mapping

| Screen | Backend | Frontend route |
| --- | --- | --- |
| Settings → Business Profile | `GET/PATCH /api/v1/businesses/{id}/` (incl. `social_links`) | `/app/settings?tab=profile` |
| Settings → Branding, Catalogue | `GET/PATCH /api/v1/business-settings/` | `/app/settings?tab=branding`, `?tab=catalogue` |
| Settings → Notifications | `GET/PATCH /api/v1/notifications/preferences/` | `/app/settings?tab=notifications` |
| Announcement banner | `GET /api/v1/announcements/` | both layouts |
| Announcements (Super Admin) | `/api/v1/admin/announcements/` (+ `publish`, `unpublish`, `archive`, `recipients`, `audience-count`, `business-options`) | `/admin/announcements` |
| Email Templates (Super Admin) | `/api/v1/admin/email-templates/` (+ `{key}/preview`, `{key}/test`) | `/admin/email-templates` |

## Phase 8 verification record (2026-10-19)

- Backend: 401 passed + 2 skipped on SQLite; **403 passed on PostgreSQL 17.6**. `check`,
  `makemigrations --check` and `spectacular --validate --fail-on-warn` clean. New migrations:
  `businesses 0003_business_settings`, `notifications 0002_preferences_templates_announcements`
  (applied to the SQLite and PostgreSQL dev databases).
- Frontend: Vitest 25 passed; lint clean; build OK (catalogue/product editors and media library now
  code-split; main chunk 466 kB).
- Live HTTP smoke test against PostgreSQL: 37/37 checks (settings + defaults, social-link validation,
  preference locks and suppression, business enquiry-email switch, template allowlist/required links,
  preview, test-to-self, edited template used for real sign-up mail, announcement audiences, feed,
  re-publish dedup, scheduler run twice, permissions, audit entries).
- **Visually checked in headless Chrome** (signed in as a test owner and a test Super Admin created in
  the local dev DB): all six Settings tabs at 1440 px, Notifications tab at 390 px, Announcements list
  and editor, Email Templates — no console errors, no horizontal overflow; a preference toggle saved and
  restored through the real API; announcement banner shown.

## Phase 9 screen → feature mapping

| Screen | Backend | Frontend route |
| --- | --- | --- |
| Dashboard | `GET /api/v1/admin/dashboard/?from=&to=&tz=` | `/admin/dashboard` (`/admin` redirects here) |
| Businesses | `GET /api/v1/admin/businesses/` (+ filters), `…/summary/`, `GET …/{id}/`, `POST …/{id}/suspend/`, `…/{id}/reactivate/` | `/admin/businesses` (`?business=<id>`) |
| Users & Roles | `GET /api/v1/admin/users/` (+ filters), `…/summary/`, `GET/PATCH …/{id}/` | `/admin/users` (`?user=<id>`) |
| Catalogues | `GET /api/v1/admin/catalogues/` (+ filters), `…/summary/`, `GET …/{id}/`, `…/{id}/qr/`, `POST …/{id}/unpublish/` | `/admin/catalogues` (`?catalogue=<id>`) |
| Domains & QR | `GET /api/v1/admin/catalogues/?status=published`, `…/{id}/qr/` | `/admin/domains-qr` |
| System Settings | `GET /api/v1/admin/system/` | `/admin/system` |
| Admin Profile | `GET/PATCH /api/v1/auth/me/`, `POST /api/v1/auth/change-password/` | `/admin/profile` |

## Phase 9 verification record (2026-10-19)

- Backend: 421 passed + 2 skipped on SQLite; **423 passed on PostgreSQL 17.6**. `check`,
  `makemigrations --check` and `spectacular --validate --fail-on-warn` clean. New migration:
  `billing 0002_payment_paid_index` (index only; applied to the SQLite and PostgreSQL dev databases).
- Frontend: Vitest 26 passed; lint clean; build OK (main chunk ~470 kB; new admin pages code-split).
- Live HTTP smoke test against PostgreSQL: 46/46 checks (owner/Support Admin/Super Admin access to every
  new endpoint, dashboard counts, mock payments excluded from revenue, timezone validation, no secrets in
  system status, business search/detail, suspend → owner locked out + public catalogue 404 + owner
  notified → reactivate, user deactivation blocks sign-in, self-change 409, Support Admin cannot change
  roles, admin QR, takedown, audit entries).
- **Visually checked in headless Chrome** (test Super Admin in the local dev DB): dashboard at 1440 and
  390 px, Businesses with detail panel, Users, Catalogues, Domains & QR, System, Profile — no console
  errors, no horizontal overflow. One real suspend → reactivate of the "Visual Check Store" test business
  through the UI (reason required before confirm).

## UI fidelity pass (2026-10-20)

All panel screens were restyled to the reference PDF: light sidebar with solid-blue active item and
plan card, header with Ctrl + K search / bell / help / role, reference hero banners with cropped
reference artwork, stat cards, toolbars, pastel pills, numbered pagination, donut and combined trend
charts, mobile header and bottom tab bar. This closes the earlier "Sidebar + header shell" 🟡 items
(global search, help icon, Upgrade card). Per-screen status, verification record and remaining
differences: **`docs/ui-visual-fidelity-audit.md`**. Verified with headless Chrome screenshots at
1536 × 1024, 1440 × 900 and 390 × 844 plus 15 interaction checks; Vitest 26 passed, lint clean, build OK.
No screen is claimed pixel-perfect.

## Recommended next phase

**Phase 10: Subscriptions & Plans completion** (A3 charts, detail panel, renew; A6 card grid, popular
flag, duplicate) together with **Admin security** (A17: two-factor authentication, session list). After
that: marketing site completion & public pages (B1 follow-ups: About, Privacy, Refund pages, real FAQ,
approved stats/prices/testimonials; public catalogue SEO). Custom domains (A8) need infrastructure
decisions first (see SETUP.md). Media follow-ups (direct-to-S3 uploads, video posters, custom
folders/tags) remain open.