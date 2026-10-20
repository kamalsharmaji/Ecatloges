import heroArt from '@/assets/reference/hero-dashboard.webp'
import {
  ArrowRight, BookOpen, Box, Copy, Crown, Eye, History, Link2, MessageCircle, MessageSquareText, Package, Plus, QrCode, Share2,
  Upload, Users, type LucideIcon,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useBillingOverview } from '@/api/billing'
import { useCatalogues, useCatalogueSummary, useProductSummary } from '@/api/content'
import { downloadQr, useAnalytics, useEnquiries, useEnquirySummary } from '@/api/leads'
import { useActivity } from '@/api/workspace'
import { toSegments } from '@/components/charts/chartUtils'
import { Donut, DonutLegend } from '@/components/charts/Donut'
import { MultiLineChart } from '@/components/charts/MultiLineChart'
import { Sparkline } from '@/components/charts/Sparkline'
import { ActionMenu } from '@/components/panel/ActionMenu'
import { StatCard, StatGrid } from '@/components/panel/StatCard'
import { StatusPill } from '@/components/panel/StatusPill'
import { buttonClasses } from '@/components/ui/buttonStyles'
import { Card } from '@/components/ui/Card'
import { Badge, Spinner } from '@/components/ui/Feedback'
import { useToast } from '@/components/ui/toast'
import { useAuth } from '@/features/auth/AuthContext'
import { useActiveBusiness } from '@/features/business/BusinessContext'
import { formatDate } from '@/features/billing/format'
import { isPlanError } from '@/features/content/format'
import { MediaThumb } from '@/features/content/MediaThumb'
import { presetRange } from '@/features/leads/dateRange'
import { Avatar, EnquiryStatusPill } from '@/features/leads/LeadBits'
import { QrImage } from '@/features/leads/QrImage'
import { actionLabel, relativeTime } from '@/features/workspace/format'
import type { Catalogue } from '@/types/content'
import { cn } from '@/utils/cn'

interface QuickLink {
  to: string
  title: string
  icon: LucideIcon
  tone: string
  requires?: string
}

// The six reference quick actions, each mapped to the existing screen that performs it.
const QUICK_ACTIONS: QuickLink[] = [
  { to: '/app/catalogues/new', title: 'Create Catalogue', icon: Plus, tone: 'bg-[#e6f0fe] text-white [&_svg]:bg-brand-700', requires: 'catalogue.create' },
  { to: '/app/products/new', title: 'Add Product', icon: Box, tone: 'bg-[#e3f8ec] text-white [&_svg]:bg-[#22b45a]', requires: 'product.create' },
  { to: '/app/media', title: 'Bulk Upload', icon: Upload, tone: 'bg-[#efe8fe] text-white [&_svg]:bg-[#8b5cf6]', requires: 'media.upload' },
  { to: '/app/qr-codes', title: 'Generate QR Code', icon: QrCode, tone: 'bg-[#fff0dc] text-white [&_svg]:bg-[#f59e0b]', requires: 'qrcode.view' },
  { to: '/app/qr-codes', title: 'View Public Links', icon: Link2, tone: 'bg-[#fde7f1] text-white [&_svg]:bg-[#e0408f]', requires: 'catalogue.view' },
  { to: '/app/team', title: 'Manage Team', icon: Users, tone: 'bg-[#e6f0fe] text-white [&_svg]:bg-[#3b82f6]', requires: 'member.view' },
]

const RANGES = [
  { value: '7', label: 'Last 7 Days' },
  { value: '30', label: 'Last 30 Days' },
  { value: '90', label: 'Last 90 Days' },
]

function SectionTitle({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-[17px] font-bold tracking-tight text-ink">{title}</h2>
      {action}
    </div>
  )
}

function ViewAll({ to, label = 'View All' }: { to: string; label?: string }) {
  return (
    <Link to={to} className="inline-flex items-center gap-1 text-[13px] font-medium text-brand-700 hover:underline">
      {label} <ArrowRight className="size-3.5" aria-hidden />
    </Link>
  )
}

function ShareCard({ catalogue }: { catalogue: Catalogue }) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const url = catalogue.public_url
  const text = encodeURIComponent(`${catalogue.name} — ${url}`)
  const shares = [
    { label: 'WhatsApp', href: `https://wa.me/?text=${text}`, className: 'bg-[#25d366]', icon: MessageCircle },
    { label: 'Facebook', href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, className: 'bg-[#1877f2]', glyph: 'f' },
    { label: 'LinkedIn', href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`, className: 'bg-[#0a66c2]', glyph: 'in' },
    { label: 'X', href: `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}`, className: 'bg-[#0f1419]', glyph: 'X' },
  ]
  return (
    <>
      <div className="flex gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <MediaThumb media={catalogue.cover} alt="" className="size-12 shrink-0 rounded-lg" />
            <p className="truncate text-[15px] font-semibold text-ink">{catalogue.name}</p>
          </div>
          <div className="mt-3 flex h-9 items-center rounded-lg border border-[#d5e5fa] pl-3 text-[12.5px] text-ink">
            <span className="min-w-0 flex-1 truncate">{url}</span>
            <button type="button" aria-label="Copy link" title="Copy link" onClick={() => navigator.clipboard?.writeText(url).then(() => toast.show('Link copied.'))}
              className="flex h-full w-9 items-center justify-center text-brand-700 hover:bg-brand-50">
              <Copy className="size-4" />
            </button>
          </div>
        </div>
        <QrImage catalogueId={catalogue.id} alt={`QR code for ${catalogue.name}`} className="size-[76px] shrink-0 rounded-md" />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <a href={url} target="_blank" rel="noreferrer" className={buttonClasses('primary', 'md', 'px-2 text-[13px] whitespace-nowrap')}>Open Catalogue</a>
        <button type="button" disabled={busy} className={buttonClasses('secondary', 'md', 'px-2 text-[13px] whitespace-nowrap')}
          onClick={async () => {
            setBusy(true)
            try { await downloadQr(catalogue.id, catalogue.slug, 'png') } catch { toast.show('Could not download the QR code.', 'error') } finally { setBusy(false) }
          }}>
          Download QR
        </button>
      </div>
      <div className="mt-3 flex items-center gap-2.5">
        <span className="mr-1 text-[13px] whitespace-nowrap text-ink">Share on</span>
        {shares.map((s) => (
          <a key={s.label} href={s.href} target="_blank" rel="noreferrer" aria-label={`Share on ${s.label}`} title={`Share on ${s.label}`}
            className={cn('flex size-8 items-center justify-center rounded-full text-[13px] font-bold text-white', s.className)}>
            {s.icon ? <s.icon className="size-4" /> : s.glyph}
          </a>
        ))}
        {typeof navigator !== 'undefined' && 'share' in navigator && (
          <button type="button" aria-label="More sharing options" title="More sharing options"
            onClick={() => navigator.share({ title: catalogue.name, url }).catch(() => undefined)}
            className="flex size-8 items-center justify-center rounded-full bg-[#eef4fd] text-brand-700">
            <Share2 className="size-4" />
          </button>
        )}
      </div>
    </>
  )
}

export function DashboardPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { businessId, context, can } = useActiveBusiness()
  const canCatalogues = can('catalogue.view')
  const catalogueSummary = useCatalogueSummary(canCatalogues ? businessId : null)
  const productSummary = useProductSummary(can('product.view') ? businessId : null)
  const canEnquiries = can('enquiry.view')
  const canAnalytics = can('analytics.view')
  const enquirySummary = useEnquirySummary(businessId, canEnquiries)
  const recentEnquiries = useEnquiries(businessId, { page_size: 5 }, canEnquiries)
  const [rangeKey, setRangeKey] = useState('30')
  const range = useMemo(() => presetRange(rangeKey), [rangeKey])
  const analytics = useAnalytics(businessId, range, canAnalytics)
  const recent = useCatalogues(canCatalogues ? businessId : null, { page_size: 4, ordering: '-updated_at' })
  const published = useCatalogues(canCatalogues ? businessId : null, { page_size: 1, status: 'published', ordering: '-updated_at' })
  const billing = useBillingOverview(businessId, can('subscription.view'))
  const activity = useActivity(businessId, { page_size: 4 }, can('audit_log.view'))
  if (!context) return null

  const a = analytics.data
  const series = a?.series ?? []
  const sources = a ? toSegments(a.sources) : []
  const sub = billing.data?.subscription
  const shareTarget = published.data?.results[0]

  return (
    <>
      <section className="relative mb-4 overflow-hidden rounded-2xl bg-[linear-gradient(100deg,#1c4fe0_0%,#1d63f2_45%,#3d8dfb_100%)] text-white">
        <img src={heroArt} alt="" aria-hidden className="pointer-events-none absolute inset-y-0 right-0 hidden h-full w-auto max-w-[60%] object-cover object-left lg:block lg:[mask-image:linear-gradient(90deg,transparent,black_12%)]" />
        <div className="relative px-6 py-7 sm:px-10 lg:max-w-[52%]">
          <h1 className="text-[28px] leading-tight font-bold sm:text-[32px]">Welcome Back, {user?.full_name.split(' ')[0]}! <span aria-hidden>👋</span></h1>
          <p className="mt-2 max-w-[460px] text-[15px] leading-snug text-white/90">Manage your catalogues, showcase your products and grow your business digitally with myEcatalogues.</p>
          {can('catalogue.create') && (
            <Link to="/app/catalogues/new" className="mt-5 inline-flex h-11 items-center gap-2 rounded-lg bg-white px-5 text-[15px] font-semibold text-brand-800 hover:bg-brand-50">
              Create New Catalogue <ArrowRight className="size-4" aria-hidden />
            </Link>
          )}
        </div>
      </section>

      <StatGrid>
        <StatCard icon={BookOpen} label="Total Catalogues" value={catalogueSummary.data?.total ?? '—'} loading={canCatalogues && catalogueSummary.isPending}
          hint={catalogueSummary.data ? `${catalogueSummary.data.published} published` : undefined} />
        <StatCard icon={Package} tone="pink" label="Total Products" value={productSummary.data?.total ?? '—'} loading={productSummary.isPending && can('product.view')}
          hint={productSummary.data ? `${productSummary.data.published} published` : undefined} />
        {/* Views come from analytics (plan + permission); "—" when unavailable, never an invented number. */}
        <StatCard icon={Eye} tone="green" label="Catalogue Views" value={a?.totals.catalogue_views.toLocaleString() ?? '—'}
          loading={canAnalytics && analytics.isPending}
          hint={a ? RANGES.find((r) => r.value === rangeKey)?.label : isPlanError(analytics.error) ? 'Needs a plan with analytics' : undefined}
          chart={a ? <Sparkline values={series.map((p) => p.catalogue_views)} color="#22b45a" /> : undefined} />
        <StatCard icon={MessageSquareText} tone="amber" label="Enquiries" value={enquirySummary.data?.total ?? '—'} loading={canEnquiries && enquirySummary.isPending}
          hint={enquirySummary.data ? `${enquirySummary.data.this_month} this month` : undefined}
          chart={a ? <Sparkline values={series.map((p) => p.enquiries)} color="#f5a524" /> : undefined} />
      </StatGrid>

      <div className="mb-4 grid gap-4 xl:grid-cols-[minmax(0,575fr)_minmax(0,390fr)_minmax(0,300fr)] [&>*]:min-w-0">
        {canAnalytics && (
          <Card className="p-4">
            <SectionTitle title="Views & Enquiries" action={
              <select aria-label="Date range" value={rangeKey} onChange={(e) => setRangeKey(e.target.value)}
                className="h-8 rounded-lg border border-[#d5e5fa] bg-white px-2 text-[13px] text-ink">
                {RANGES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            } />
            {analytics.isPending ? <Spinner /> : a ? (
              series.every((p) => p.catalogue_views === 0 && p.enquiries === 0) ? (
                <p className="py-14 text-center text-sm text-body">No views or enquiries in this period yet. Share a catalogue link or QR code to start collecting data.</p>
              ) : (
                <MultiLineChart label="Catalogue views and enquiries" dates={series.map((p) => p.date)} series={[
                  { key: 'views', label: 'Catalogue Views', color: '#2f6df6', values: series.map((p) => p.catalogue_views) },
                  { key: 'enquiries', label: 'Enquiries', color: '#8b5cf6', values: series.map((p) => p.enquiries) },
                ]} />
              )
            ) : (
              <div className="py-10 text-center">
                <p className="text-sm text-body">{isPlanError(analytics.error) ? 'Charts of catalogue views and enquiries are part of plans with analytics.' : 'Analytics couldn’t be loaded.'}</p>
                {isPlanError(analytics.error) && can('subscription.manage') && <Link to="/app/billing/plans" className={buttonClasses('primary', 'sm', 'mt-3')}>View plans</Link>}
              </div>
            )}
          </Card>
        )}
        {canAnalytics && (
          <Card className="p-4">
            <SectionTitle title="Top Traffic Sources" />
            {a && sources.length > 0 ? (
              <div className="flex items-center gap-5">
                <Donut segments={sources} centerValue={a.totals.catalogue_views.toLocaleString()} centerLabel="Total Views" />
                <DonutLegend segments={sources} showCount={false} />
              </div>
            ) : <p className="py-14 text-center text-sm text-body">{analytics.isPending ? 'Loading…' : 'No visits recorded in this period.'}</p>}
          </Card>
        )}
        <Card className="p-4">
          <SectionTitle title="Quick Actions" />
          <ul className="grid grid-cols-2 gap-2.5">
            {QUICK_ACTIONS.filter((l) => !l.requires || can(l.requires)).map(({ to, title, icon: Icon, tone }) => (
              <li key={title}>
                <Link to={to} className={cn('flex h-[66px] flex-col items-center justify-center gap-1.5 rounded-xl text-center text-[12px] font-medium text-ink hover:brightness-[0.97]', tone)}>
                  <Icon className="size-7 rounded-lg p-1.5 text-white" aria-hidden />
                  <span className="text-ink">{title}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="mb-4 grid gap-4 xl:grid-cols-[minmax(0,575fr)_minmax(0,390fr)_minmax(0,300fr)] [&>*]:min-w-0">
        {canCatalogues && (
          <Card className="p-4">
            <SectionTitle title="Recent Catalogues" action={<ViewAll to="/app/catalogues" />} />
            {recent.data?.results.length ? (
              <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {recent.data.results.map((c) => (
                  <li key={c.id} className="rounded-xl bg-white p-1.5 ring-1 ring-[#e6edf7]">
                    <Link to={`/app/catalogues/${c.id}`}><MediaThumb media={c.cover} alt={c.name} className="h-[68px] w-full rounded-lg" /></Link>
                    <div className="px-1 pt-2 pb-1">
                      <Link to={`/app/catalogues/${c.id}`} className="block truncate text-[13px] font-semibold text-ink hover:text-brand-700">{c.name}</Link>
                      <p className="text-[12px] text-body">{c.product_count} Products</p>
                      <div className="mt-1.5 flex items-center justify-between">
                        <StatusPill status={c.status} />
                        <ActionMenu tint items={[
                          { label: 'Edit', onSelect: () => navigate(`/app/catalogues/${c.id}`) },
                          { label: 'Open public page', onSelect: () => window.open(c.public_url, '_blank', 'noopener'), hidden: c.status !== 'published' },
                        ]} />
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="py-6 text-center">
                <p className="text-sm text-body">No catalogues yet.</p>
                {can('catalogue.create') && <Link to="/app/catalogues/new" className={buttonClasses('primary', 'sm', 'mt-3')}><Plus className="size-4" aria-hidden /> Create catalogue</Link>}
              </div>
            )}
          </Card>
        )}
        {canEnquiries && (
          <Card className="p-4">
            <SectionTitle title="Recent Enquiries" action={<ViewAll to="/app/enquiries" />} />
            {recentEnquiries.isPending ? <Spinner /> : recentEnquiries.data?.results.length ? (
              <ul className="space-y-1">
                {recentEnquiries.data.results.map((e) => (
                  <li key={e.id}>
                    <Link to={`/app/enquiries?enquiry=${e.id}`} className="flex items-center gap-3 rounded-lg px-1 py-1.5 hover:bg-canvas">
                      <Avatar name={e.name} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-semibold text-ink">{e.name}</span>
                        <span className="block truncate text-[12px] text-body">{e.message || e.product_name || e.catalogue_name || 'General enquiry'}</span>
                      </span>
                      <span className="hidden shrink-0 text-[11.5px] text-body sm:block">{relativeTime(e.created_at)}</span>
                      <EnquiryStatusPill status={e.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : <p className="py-8 text-center text-sm text-body">No enquiries yet. Share a catalogue to start receiving them.</p>}
          </Card>
        )}
        {canCatalogues && (
          <Card className="p-4">
            <SectionTitle title="Share Your Catalogue" />
            {shareTarget ? <ShareCard catalogue={shareTarget} /> : (
              <p className="py-8 text-center text-sm text-body">Publish a catalogue to get its link and QR code here.</p>
            )}
          </Card>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,420fr)_minmax(0,380fr)_minmax(0,465fr)] [&>*]:min-w-0">
        {canAnalytics && (
          <Card className="p-4">
            <SectionTitle title="Top Performing Products" action={<ViewAll to="/app/analytics" />} />
            {a?.top_products.length ? (
              <ul className="space-y-2">
                {a.top_products.slice(0, 4).map((p) => (
                  <li key={p.id} className="flex items-center gap-3">
                    <MediaThumb media={p.thumbnail} alt="" className="size-9 shrink-0 rounded-md" />
                    <span className="min-w-0 flex-1">
                      <Link to={`/app/products/${p.id}`} className="block truncate text-[13px] font-semibold text-ink hover:text-brand-700">{p.name}</Link>
                      <span className="block text-[12px] text-body">{p.views.toLocaleString()} views</span>
                    </span>
                    <span className="text-[12.5px] font-medium text-[#14a04a]">{p.enquiries} {p.enquiries === 1 ? 'enquiry' : 'enquiries'}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="py-8 text-center text-sm text-body">{analytics.isPending ? 'Loading…' : 'No product views in this period.'}</p>}
          </Card>
        )}
        {can('subscription.view') && (
          <Card className="p-4">
            <SectionTitle title="Subscription & Usage" action={<ViewAll to="/app/billing/plans" label="View Plans" />} />
            {sub ? (
              <>
                <div className="flex items-center gap-3">
                  <span className="flex size-10 items-center justify-center rounded-lg bg-[#fff1d6] text-amber-500"><Crown className="size-5 fill-amber-400" aria-hidden /></span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-[15px] font-semibold text-ink">{sub.plan_name} <Badge tone={sub.status === 'active' ? 'success' : 'warning'}>{sub.status === 'active' ? 'Active' : sub.status.replace('_', ' ')}</Badge></p>
                    <p className="text-[12px] text-body">Valid till {formatDate(sub.current_period_end)}</p>
                  </div>
                  {can('subscription.manage') && <Link to="/app/billing" className={buttonClasses('soft', 'sm')}>Manage Plan</Link>}
                </div>
                <ul className="mt-3 space-y-2.5">
                  {billing.data?.usage.map((u) => {
                    const pct = u.limit ? Math.min(100, Math.round(((u.used ?? 0) / u.limit) * 100)) : 0
                    return (
                      <li key={u.key} className="grid grid-cols-[96px_1fr_auto] items-center gap-3 text-[12.5px] text-ink">
                        <span>{u.label}</span>
                        <span className="h-2 overflow-hidden rounded-full bg-[#e8eef7]"><span className="block h-full rounded-full bg-gradient-to-r from-brand-700 to-[#22c3e6]" style={{ width: `${pct}%` }} /></span>
                        <span className="tabular-nums">{u.used ?? '—'} / {u.limit ?? '∞'}</span>
                      </li>
                    )
                  })}
                </ul>
              </>
            ) : <p className="py-8 text-center text-sm text-body">{billing.isPending ? 'Loading…' : 'No active plan.'}</p>}
          </Card>
        )}
        {can('audit_log.view') && (
          <Card className="p-4">
            <SectionTitle title="Recent Activity" action={<ViewAll to="/app/activity" />} />
            {activity.data?.results.length ? (
              <ul className="space-y-2.5">
                {activity.data.results.map((e) => (
                  <li key={e.id} className="flex items-center gap-3">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#eef4fd] text-brand-700"><History className="size-4" aria-hidden /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] text-ink">{actionLabel(e.action)}</span>
                      <span className="block truncate text-[12px] text-body">{e.target_label || e.actor_name}</span>
                    </span>
                    <span className="shrink-0 text-[11.5px] text-body">{relativeTime(e.created_at)}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="py-8 text-center text-sm text-body">{activity.isPending ? 'Loading…' : 'No activity yet.'}</p>}
          </Card>
        )}
      </div>
    </>
  )
}
