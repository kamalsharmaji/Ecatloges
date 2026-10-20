# UI Visual Fidelity Audit (reference: `myEcatalogues_All_UI_Screens.pdf`)

Reference file: `C:\Users\Administrator\Downloads\myEcatalogues_All_UI_Screens.pdf` (39 pages).
p1 = cover, p2–p3 = screen index, **p4–p39 = 36 screenshot pages** (each a 1536 × 1024 raster render;
p5, p6, p18, p28 and p32 also contain mobile mock-ups). Screens are identified by what the screenshot
shows, not by the printed page title (many titles do not match).

Audit started 2026-10-19. "Actual" screenshots were captured with headless Chrome (CDP) at the
reference size **1536 × 1024** and at 1440 × 900 / 390 × 844, signed in as the local test accounts
`visual.owner@example.com` (Visual Check Store) and `visual.admin@example.com`.

Status values: Not audited · Audited · Corrections in progress · Visually compared ·
Verified against reference · Blocked — reason.

## 1. Global visual language measured from the reference

Colours were sampled from the reference rasters (`tools/sample.py`, 3 × 3 median).

| Element | Reference | Implementation before this pass |
| --- | --- | --- |
| Page background | very light sky blue `#EEF6FD` | grey-blue `#F6F8FC` |
| Sidebar | ~236 px, same light-blue surface as the page, no border; logo top-left; 13 items, 20–22 px outline icons, 15 px medium navy labels, ~44 px row pitch; **active item = solid blue gradient pill** (`#2180FC → #0576FE`) with white text and soft shadow; red count badge; "Upgrade to Business Plan" card at the bottom (owner) / "Platform Management" card (admin) | 256 px white sidebar with right border, business card at top, light-blue active row, extra items (Roles, Notifications, Activity Log, Help & Support), "Switch business" footer. **Admin sidebar was dark slate** |
| Header | 64 px, no bottom rule; hamburger button; rounded search field (`#E3EFFD`) with "Ctrl + K" hint; bell with red badge; help (?) icon; avatar + name + role subtitle + chevron | bell + avatar/name only, white bar with border |
| Content area | full width, ~16 px gutters, ~16 px vertical rhythm | centred `max-w-6xl` / `max-w-7xl`, 24–32 px gaps |
| Hero banner (owner pages) | rounded 16 px, light-blue gradient `#CCE5FD → #A4CDFD`, white 64 px icon tile, 32–34 px bold navy title, 2-line description, **illustration in the middle-right**, frosted check-list card with green filled check circles, large primary CTA | flat gradient, no illustration, outline checks, wrapped CTA |
| Admin page header | breadcrumb "Super Admin › Page", 64 px white icon tile, 26 px bold navy title, one-line description, actions top-right; no hero | owner-style hero banner |
| Stat card | white, 16 px radius, ~96 px tall; 64 px rounded tile with pastel fill (`#D5E9FD`, `#FDDAED`, `#E8DDFD`, `#D9F9E6`, amber) and saturated filled glyph; label 13 px, value 24–26 px bold navy, trend line in green; decorative ascending bars on the right | 48 px tile, value 24 px, no ornament |
| Toolbar | not boxed; 40 px inputs, search field tinted `#EAF4FE`, white selects with chevrons, view toggle as separate 40 px squares, active = solid blue | inside a white bordered box |
| Cards / tables | white, 16 px radius, very soft shadow, no visible border; table header row tinted `#EBF4FD`, 13 px semibold navy labels (sentence case); rows ~50 px with hair-line separators; icon-only row actions (eye / pencil / ⋯) in 32 px tinted squares | bordered cards, upper-case grey headers |
| Status pills | rounded 6 px, pastel fill, no ring: Published/Active green, Draft blue, Inactive red/pink, Pending/Expiring amber | ring-outlined pills |
| Pagination | "Showing 1 to N of M …" left; numbered 36 px square buttons right, active solid blue | "Page x of y · n total" + Previous/Next |
| Primary button | `#0566F5`, 8 px radius, 40–44 px tall | `#1D4ED8` |
| Typography | Inter-like sans; navy ink (`#0B1A51`) for titles and values; body `#33416B`; muted `#6B7AA1` | slate ink `#0F172A`, muted `#64748B` |
| Logo | round blue emblem + "MyEcatalogs.com" word-mark (owner); book emblem + "Super Admin" pill (admin) | square book tile + "myEcatalogues". **Product name kept as myEcatalogues** (the reference spelling "MyEcatalogs" conflicts with the product name used everywhere else); emblem styling matched |

## 2. Screen inventory and mapping

| Ref page (printed title) | Screenshot shows | Route / component | Status before | Notes |
| --- | --- | --- | --- | --- |
| p4 ("01 Landing") | Marketing landing page | `/` · `pages/HomePage.tsx`, `features/landing/*` | Audited — superseded | The user supplied a newer, separate landing reference on 2026-10-19 and the page was rebuilt to it (Phase 9). Not re-done against p4. |
| p5 ("02") | Registration & payment flow, 8 panels | `/register`, `/verify-email`, `/onboarding`, `/app/billing/plans`, `/app/billing/checkout/:id`, `/app/billing/payments/:id` | Audited | Stepper header and card layout differ; 6-digit code, WhatsApp verify, GSTIN, multiple payment-method tiles are features that do not exist (not added). |
| p6 ("03 Login") | Login, desktop + mobile | `/login` · `pages/auth/LoginPage.tsx`, `layouts/AuthLayout.tsx` | Audited | Reference: split layout, left marketing column with device illustration and 4 stats, right card with Email / Mobile tabs and Google / Microsoft buttons. Mobile login and SSO do not exist (not added). Stats row would be unapproved marketing figures (not added). |
| p7 ("04") | Owner dashboard v1 | `/app` · `pages/app/DashboardPage.tsx` | Audited | See §3. |
| p8 ("05") | Catalogues | `/app/catalogues` · `pages/content/CataloguesPage.tsx` | Audited | |
| p9 ("06") | Products | `/app/products` · `pages/content/ProductsPage.tsx` | Audited | |
| p10 ("07") | Categories + create panel | `/app/categories` · `pages/content/CategoriesPage.tsx` | Audited | |
| p11 ("08 Media Library"), p37 ("36") | **Super Admin** Media & Storage | none | Blocked — no platform media module | Only totals exist (Phase 9). Building the page would be a new feature. |
| p12 ("09 Enquiries") | Owner dashboard v2 | `/app` | Audited | Same page as p7, different arrangement; p7 used as the primary target. |
| p13 ("10 Analytics") | Notifications & Activity Log | `/app/notifications` · `pages/app/NotificationsPage.tsx` | Audited | |
| p14 ("11 QR Codes") | Invoices + detail panel | `/app/billing/invoices` · `pages/billing/InvoicesPage.tsx` | Audited | "Select business", "Generate Invoice", business column are admin-style controls not valid for an owner (tenant rule). |
| p15 ("12 Customers") | Settings (Business Profile tab) | `/app/settings` · `pages/app/SettingsPage.tsx`, `features/settings/SettingsTabs.tsx` | Audited | Domain & SEO, Payment Settings, Email Templates tabs, business hours, GST/PAN, tags have no backing feature. |
| p16 ("13 Subscription"), p34 ("33") | Enquiries + detail panel | `/app/enquiries` · `pages/leads/EnquiriesPage.tsx` | Audited | |
| p17 ("14 Invoices") | Subscription plans & current subscription | `/app/billing`, `/app/billing/plans` · `pages/billing/BillingPage.tsx`, `PlansPage.tsx` | Audited | |
| p18 ("16") | Public catalogue desktop + mobile | `/c/:business/:catalogue` · `pages/public/PublicCataloguePage.tsx` | Audited | Ratings, wishlist, trust logos, "Best Seller" badges not modelled. |
| p19 ("17") | Media Library | `/app/media` · `pages/content/MediaLibraryPage.tsx` | Audited | |
| p20 ("18"), p33 ("31") | Super Admin Support Tickets | `/admin/support` · `pages/admin/AdminSupportPage.tsx` | Audited | |
| p21 ("19") | Team Members + detail | `/app/team` · `pages/app/TeamPage.tsx` | Audited | Branches not modelled. |
| p22 ("20") | Super Admin Users & Roles | `/admin/users` · `pages/admin/AdminUsersPage.tsx` | Audited | "Add New User" / role editor not in scope (roles fixed in code). |
| p23 ("21") | Super Admin Plans & Pricing | `/admin/plans` · `pages/admin/AdminPlansPage.tsx` | Audited | Card grid is Phase 10 scope. |
| p24 ("22") | Super Admin Dashboard | `/admin/dashboard` · `pages/admin/AdminDashboardPage.tsx` | Audited | |
| p25 ("23"), p36 ("35") | Super Admin Subscriptions | `/admin/subscriptions` · `pages/admin/AdminBillingPages.tsx` | Audited | Charts / detail panel are Phase 10 scope. |
| p26 ("24"), p35 ("34") | Edit Product | `/app/products/:id` · `pages/content/ProductEditorPage.tsx` | Audited | Brand, variants, specifications, SEO, rich-text are not modelled. |
| p27 ("25") | Super Admin Businesses | `/admin/businesses` · `pages/admin/AdminBusinessesPage.tsx` | Audited | Import / Add business not in scope. |
| p28 ("26") | Business profile setup wizard, desktop + mobile | `/onboarding` · `pages/onboarding/CreateBusinessPage.tsx` | Audited | Multi-step wizard is Phase 10 scope. |
| p29 ("27") | Super Admin Catalogues | `/admin/catalogues` · `pages/admin/AdminCataloguesPage.tsx` | Audited | |
| p30 ("28") | Super Admin Domains & QR | `/admin/domains-qr` · `pages/admin/AdminDomainsQrPage.tsx` | Audited | Custom domains not implemented (stated on the page). |
| p31 ("29") | Owner Analytics | `/app/analytics` · `pages/leads/AnalyticsPage.tsx` | Audited | Locations omitted by design (no IP storage). |
| p32 ("30") | Owner dashboard v3 + mobile | `/app` | Audited | Mobile mock-up used for the 390 px check. |
| p38 ("37") | Super Admin Profile & Security | `/admin/profile` · `pages/admin/AdminProfilePage.tsx` | Audited | 2FA, sessions, login history not implemented (Phase 10). |
| p39 ("38") | Backup & Recovery | none | Blocked — deliberately not built | Restores are destructive; documented procedure only (SETUP.md). |

**Totals:** 36 screenshot pages → **29 distinct screens** (p11/p37, p16/p34, p20/p33, p25/p36, p26/p35
are duplicates; p7/p12/p32 are three variants of one dashboard). 27 map to an implemented route;
2 (Super Admin Media & Storage, Backup & Recovery) have no implementation and are blocked.

## 3. Per-screen differences and corrections (before this pass)

Global differences from §1 apply to every panel screen and are fixed once in the shared layout and
components. Screen-specific items:

- **Owner dashboard (p7/p12/p32)** — hero should be a saturated blue gradient (`#1E6CF5 → #3A8DFB`)
  with white text, two CTAs and the device illustration; stat cards with sparkline (views/enquiries
  have real daily series); "Views & Enquiries" chart with range select; Quick Actions as 2-column
  pastel tiles; Recent Catalogues as image cards; Recent Enquiries list with status chips; Subscription &
  Usage card (real billing usage exists); Share Your Catalogue card with QR (real public link + QR API
  exist). "Top Product Categories" donut uses views per category — no such metric (not added);
  "Top Performing Products" and "Recent Activity" are possible from existing analytics/activity APIs.
- **Catalogues (p8)** — 4-up card grid with 16:9 cover, status chip top-left, ⋯ top-right, title, tagline,
  products/views/enquiries meta row, three tinted buttons Edit / View / Share; toolbar view toggle as
  separate squares; "Total Views" fourth stat (real all-time views exist) instead of "Archived".
- **Products (p9)** — table columns Product · Category · Price · MOQ · Catalogues · Status · Views ·
  Enquiries · Created · Actions; category as tinted chip; icon actions view / edit / ⋯; Bulk Actions
  dropdown at the right of the toolbar.
- **Categories (p10)** — image cards (4 per row) with icon tile, counts, status chip; create panel
  docked on the right (not a modal).
- **Media Library (p19)** — 4-up grid with type badge (JPG/PNG/MP4), name, size · date; upload dropzone,
  create folder and folder list in a right column; bottom bar with selection count and bulk actions.
- **Enquiries (p16)** — 5 stat cards; table Customer (avatar initial, phone, email) · Product /
  enquiry details · Source chip · Date · Status chip · actions (WhatsApp / email / call / ⋯); detail panel
  docked right.
- **Notifications (p13)** — compact header (icon tile + title + 2 buttons, no hero), 5 stat cards, type
  tabs as pills, list rows with tinted category icon, level chip, ⋯; detail panel docked right.
- **Invoices (p14)**, **Subscription (p17)**, **Team (p21)**, **Settings (p15)**, **Analytics (p31)** —
  hero + stats + table/panels per reference; differences are mostly the shared components plus
  layout grids.
- **Edit Product (p26)** — compact header with back button, breadcrumb, actions Preview / Duplicate /
  Save as Draft / Update; tab strip; right column Product Status / Pricing & Inventory.
- **Admin screens (p20, p22–p25, p27, p29, p30, p38)** — breadcrumb header, stat cards with "x% of total"
  hints, pill tabs, toolbar, table, and docked detail panels; light sidebar with "Platform Management"
  card. Donut summary charts at the bottom need per-status counts (available for tickets, catalogues,
  subscriptions) — implemented only where the API already returns the numbers.

Functional elements that must stay connected to real APIs: every stat value, list, filter, bulk action,
detail panel and form listed in `ui-implementation-checklist.md`. No figure in the reference is copied
into the UI; the reference numbers ("5,482 views", "₹2,48,950") are sample data.

## 4. Correction log (2026-10-19 / 20)

**Group 1 — design tokens and shell (every panel screen).** Palette sampled from the reference
(`index.css`: primary `#0566F5`, navy ink, sky canvas `#EEF6FD`, sidebar tint, table-header tint, soft
panel shadow). New `components/panel/Shell.tsx`: 236 px light sidebar with solid-blue gradient active
pill, 44 px rows, red count badges, bottom plan card ("Upgrade to <next plan>" from the live plan list /
"Platform Management" in admin); 64 px header with hamburger (collapses the sidebar on desktop, opens
the drawer on mobile), **global search with Ctrl + K** (queries the existing list endpoints, so results
respect permissions and tenant scope), bell, help icon, avatar + name + role subtitle. Owner sidebar
reduced to the reference's 13 items; Roles, Notifications, Activity Log and Help & Support stay reachable
via Team, the bell, Settings and the help icon. Admin sidebar switched from dark slate to the
reference's light style. Mobile: logo in the header and the reference's bottom tab bar
(Dashboard / Catalogues / Products / Enquiries / More).

**Group 2 — shared components.** `PageHero` (light-blue banner, 64 px icon tile, 34 px title, cropped
reference illustration, frosted check-list with green check dots, CTA; admin variant = breadcrumb
header), `StatCard` (64 px pastel tile, 24 px value, decorative bars or a real sparkline), unboxed
`Toolbar` with tinted search and chevron selects, square view toggle, numbered `Pagination` with
"Showing x to y of z", pastel status pills/badges (no outlines), 16 px-radius shadow cards, tinted
row-action squares, sentence-case tinted table headers, reference date format ("20 Oct 2026") and
Indian digit grouping for ₹. Charts: `Donut` + legend, two-series `MultiLineChart` on **one** shared
axis, `Sparkline`. Chart palette validated with the dataviz palette checker (all checks pass; worst CVD
pair 7.6 ΔE, so every chart has a labelled legend).

**Group 3 — screens.** Owner dashboard (blue hero with the reference device artwork, stat cards with
sparklines, Views & Enquiries chart with range select, Top Traffic Sources donut, 6 Quick Actions tiles,
Recent Catalogues cards, Recent Enquiries, Share Your Catalogue card with real link + QR + share buttons,
Top Performing Products, Subscription & Usage, Recent Activity); Catalogues cards; Products table
(category chips, view/enquiry icons, icon actions); Categories cards + docked create panel; Media Library
grid, upload card with Browse Files, folders; Enquiries (source chips, two-line date, contact actions,
docked detail panel); Analytics (KPI cards with sparklines, combined trend, ranked top lists, donuts,
Top Locations states that locations are not tracked); Notifications compact header and pill tabs; Team
Members hero, 4 stat cards (real counts), filters, numbered table; Subscription (plan cards, current
subscription with period progress, usage tiles, payment history, plan comparison from real limits);
Invoices hero, stats, filters, table; Settings underline tabs; Choose-plan cards; Edit Product
breadcrumb header; Login and Register split layout (reference artwork, feature list, info strip,
5-step progress on Register); Super Admin dashboard (header + artwork, status card, subscription
status donut), Plans & Pricing (hero, stats, limits table), Subscriptions (header, 5 stat cards),
Payments, Admin Profile & Security (profile card with avatar, readable permission checklist, Change
Password card, "View Activity Logs").

Artwork: 12 illustrations cropped from the reference rasters into `frontend/src/assets/reference/`
(see `SOURCE.md` there; 1× quality — replace with original artwork when available).

**Not added (would be new features or fake data):** 2FA, active sessions, security activity, danger
zone (p38); custom domains (p30); Media & Storage and Backup & Recovery admin screens (p37, p39);
mobile-number login and Google/Microsoft SSO (p6); 6-digit code / WhatsApp verification and multiple
payment-method tiles (p5); product variants, specifications, SEO, rich text (p35); location analytics
(p31); ratings/wishlist on the public catalogue (p18); marketing stats on the login page (p6 — would be
unapproved figures). Reference numbers are never copied; every value shown comes from the API.

**Kept on purpose:** product name "myEcatalogues" (reference spells "MyEcatalogs").

## 5. Verification (actually run)

- Headless Chrome (CDP) screenshots, **1536 × 1024** (reference size): 30 screens — 17 owner, 11 Super
  Admin, login, register. All rendered with no console errors, no failed API requests, no horizontal
  overflow. Each was compared by eye side by side with its reference page; **no pixel-diff tooling was
  used, so no screen is claimed pixel-perfect.**
- **390 × 844** full-page: owner dashboard, catalogues, products, enquiries, analytics, subscription,
  team, settings, admin dashboard, businesses, profile, login, register — two overflow bugs found
  (dashboard grids) and fixed; re-check clean.
- **1440 × 900**: dashboard, products, subscription, analytics, admin dashboard, admin plans, login —
  clean.
- Interaction run (15/15): Ctrl + K focuses search and returns real products; opening a result navigates
  to the editor; user menu; sidebar collapse/restore; enquiry row opens the docked detail panel
  (`?enquiry=` deep link); settings tab switch; mobile tab bar navigation; "More" opens the drawer.
- Frontend: Vitest 26 passed; ESLint clean; production build OK (main chunk 510 kB, was ~470 kB).
- Backend code was not changed in this pass; backend tests were not re-run.
- Test data: added only (4 categories, 4 catalogues, 8 products, 16 media files, 3 enquiries labelled
  "Visual Check Customer A/B/C") to the "Visual Check Store" test business through the real API. Nothing
  was deleted, reset or overwritten.

## 6. Status by screen

| Ref page | Screen | Status | Remaining differences |
| --- | --- | --- | --- |
| p4 | Landing | Visually compared (separate newer reference) | Built to the 2026-10-19 landing reference, not p4. |
| p5 | Registration flow | Visually compared (step 1) | Steps 2–8 restyled only through shared components; 6-digit code, WhatsApp verify, GSTIN and payment tiles not built. |
| p6 | Login | Visually compared | No Email/Mobile tabs, no SSO buttons, no stats row (features/figures not available). |
| p7 / p12 / p32 | Owner dashboard | Visually compared (1536 + 390) | Top Product Categories donut not built (no views-per-category metric). Chart/artwork are 1× crops. |
| p8 | Catalogues | Visually compared | Stat 4 is "Archived" (reference "Total Views"; views shown on cards). |
| p9 | Products | Visually compared | Grid toggle and Bulk Actions on one line; extra "Archived" stat kept. |
| p10 | Categories | Visually compared | "Inactive" status not modelled. |
| p13 | Notifications | Visually compared | List styling close; filters row differs slightly. |
| p14 | Invoices | Visually compared | No business column / Generate Invoice (owner view, tenant rule); detail opens a page, not a side panel. |
| p15 | Settings | Visually compared | Domain & SEO, Payment, Email Templates tabs not built. |
| p16 / p34 | Enquiries | Visually compared | No Budget field; Actions column scrolls when the panel is open. |
| p17 | Subscription | Visually compared | Plan cards show real limits; comparison uses ∞ for unlimited. |
| p18 | Public catalogue | Audited | Not restyled in this pass (beyond shared tokens). |
| p19 | Media Library | Visually compared | Custom folders/tags not built. |
| p20 / p33 | Admin Support Tickets | Visually compared | Donut summaries, Export, Ticket Settings, Create Ticket not built. |
| p21 | Team Members | Visually compared | No branch column / module-access detail panel. |
| p22 | Users & Roles | Visually compared | Role editor not built (roles fixed in code). |
| p23 | Plans & Pricing | Visually compared | Table instead of the reference card grid (Phase 10). |
| p24 | Admin dashboard | Visually compared (1536 + 390) | Revenue chart empty in dev (no live payments). |
| p25 / p36 | Subscriptions | Visually compared | Charts, detail panel, renew/suspend not built (Phase 10). |
| p26 / p35 | Edit Product | Visually compared | Tab strip, variants, specifications, SEO, live preview not built. |
| p27 | Businesses | Visually compared | Import / Add Business not built. |
| p28 | Business setup wizard | Audited | Multi-step wizard not built (Phase 10). |
| p29 | Admin Catalogues | Visually compared | Shared-component restyle only. |
| p30 | Domains & QR | Visually compared | Custom domains not implemented. |
| p31 | Analytics | Visually compared (1536 + 390) | Top Locations shows "not tracked" (no IP storage). |
| p37 | Media & Storage (admin) | Blocked — no platform media module | New feature. |
| p38 | Admin Profile & Security | Visually compared | 2FA, sessions, security activity, danger zone not built. |
| p39 | Backup & Recovery | Blocked — deliberately not built | Restores are destructive; documented in SETUP.md. |

No screen is marked "Verified against reference": comparisons were made by eye on real screenshots, and
each screen still has the differences listed above.
