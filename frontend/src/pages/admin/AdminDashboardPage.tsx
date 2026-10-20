import heroArt from '@/assets/reference/hero-admin-dashboard.webp'
import {
  BarChart3, Building2, CircleAlert, CircleCheck, Crown, CreditCard, HardDrive, Headset, IndianRupee,
  Mail, Megaphone, Package, ScrollText, Settings, Users, type LucideIcon,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { usePlatformDashboard, useSystemStatus } from '@/api/platform'
import { BarList } from '@/components/charts/BarList'
import { Donut, DonutLegend } from '@/components/charts/Donut'
import { shortMonth } from '@/components/charts/chartUtils'
import { TrendChart } from '@/components/charts/TrendChart'
import { StatCard } from '@/components/panel/StatCard'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { ErrorState, Spinner } from '@/components/ui/Feedback'
import { useAuth } from '@/features/auth/AuthContext'
import { categoryLabel } from '@/features/business/constants'
import { formatBytes, formatPrice } from '@/features/content/format'
import { presetRange } from '@/features/leads/dateRange'
import { formatDateTime } from '@/features/leads/leadFormat'
import { RangePicker } from '@/features/leads/RangePicker'
import { actionLabel, relativeTime } from '@/features/workspace/format'
import { RequirePlatformPermission } from '@/routes/guards'
import { cn } from '@/utils/cn'

const QUICK: { to: string; label: string; icon: LucideIcon; requires: string }[] = [
  { to: '/admin/businesses', label: 'Businesses', icon: Building2, requires: 'platform.business.view' },
  { to: '/admin/plans', label: 'Manage Plans', icon: Crown, requires: 'platform.plan.view' },
  { to: '/admin/payments', label: 'View Payments', icon: CreditCard, requires: 'platform.payment.view' },
  { to: '/admin/users', label: 'Manage Users', icon: Users, requires: 'platform.user.view' },
  { to: '/admin/system', label: 'System Settings', icon: Settings, requires: 'platform.system.view' },
  { to: '/admin/announcements', label: 'Send Announcement', icon: Megaphone, requires: 'platform.announcement.manage' },
  { to: '/admin/audit-logs', label: 'Audit Logs', icon: ScrollText, requires: 'platform.audit_log.view' },
  { to: '/admin/support', label: 'Support Tickets', icon: Headset, requires: 'platform.support.view' },
]

const STATUS_PILL: Record<string, string> = {
  active: 'bg-[#dcf7e5] text-[#14a04a]',
  suspended: 'bg-[#ffe1e8] text-[#e11d48]',
}

function RecentTabs({ data }: { data: NonNullable<ReturnType<typeof usePlatformDashboard>['data']> }) {
  const [tab, setTab] = useState<'businesses' | 'payments' | 'events'>('businesses')
  const tabs = [
    { key: 'businesses', label: 'Recent Businesses' },
    { key: 'payments', label: 'Recent Payments' },
    { key: 'events', label: 'Platform Events' },
  ] as const
  return (
    <Card>
      <div role="tablist" aria-label="Recent activity" className="flex gap-2 overflow-x-auto border-b border-border p-3">
        {tabs.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
            className={cn('h-10 shrink-0 rounded-lg px-4 text-sm font-medium', tab === t.key ? 'bg-brand-700 text-white shadow-pill' : 'text-ink hover:bg-brand-50')}>
            {t.label}
          </button>
        ))}
        <Link to={tab === 'payments' ? '/admin/payments' : tab === 'events' ? '/admin/audit-logs' : '/admin/businesses'}
          className="ml-auto shrink-0 self-center text-sm font-medium text-brand-700 hover:underline">View All →</Link>
      </div>
      <CardBody className="p-0">
        {tab === 'businesses' && (data.recent_businesses.length === 0 ? <Empty text="No businesses have registered yet." /> : (
          <table className="w-full text-left text-sm">
            <thead className="bg-thead text-[13px] font-semibold text-ink"><tr><th scope="col" className="px-4 py-2">Business</th><th scope="col" className="px-3 py-2">Plan</th><th scope="col" className="px-3 py-2">Status</th><th scope="col" className="hidden px-3 py-2 sm:table-cell">Users</th><th scope="col" className="hidden px-3 py-2 md:table-cell">Joined</th></tr></thead>
            <tbody className="divide-y divide-border">
              {data.recent_businesses.map((b) => (
                <tr key={b.id}>
                  <td className="px-4 py-2.5"><Link to={`/admin/businesses?business=${b.id}`} className="font-medium hover:text-brand-700">{b.name}</Link></td>
                  <td className="px-3 py-2.5 text-muted">{b.plan_name || 'No plan'}</td>
                  <td className="px-3 py-2.5"><span className={cn('rounded-md px-2 py-0.5 text-xs font-semibold capitalize', STATUS_PILL[b.status])}>{b.status}</span></td>
                  <td className="hidden px-3 py-2.5 tabular-nums sm:table-cell">{b.members}</td>
                  <td className="hidden px-3 py-2.5 text-xs text-muted md:table-cell">{formatDateTime(b.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}
        {tab === 'payments' && (data.recent_payments.length === 0 ? <Empty text="No captured payments yet." /> : (
          <table className="w-full text-left text-sm">
            <thead className="bg-thead text-[13px] font-semibold text-ink"><tr><th scope="col" className="px-4 py-2">Business</th><th scope="col" className="px-3 py-2">Plan</th><th scope="col" className="px-3 py-2 text-right">Amount</th><th scope="col" className="hidden px-3 py-2 md:table-cell">Paid</th></tr></thead>
            <tbody className="divide-y divide-border">
              {data.recent_payments.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-2.5 font-medium">{p.business_name}</td>
                  <td className="px-3 py-2.5 text-muted">{p.plan_name}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{formatPrice(p.amount, p.currency)}{p.is_test && <span className="ml-1.5 rounded bg-amber-100 px-1.5 text-[11px] font-semibold text-amber-800">TEST</span>}</td>
                  <td className="hidden px-3 py-2.5 text-xs text-muted md:table-cell">{formatDateTime(p.paid_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}
        {tab === 'events' && (data.recent_events.length === 0 ? <Empty text="No platform events yet." /> : (
          <ul className="divide-y divide-border">
            {data.recent_events.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <span className="min-w-0">
                  <span className="font-medium">{actionLabel(e.action)}</span>
                  <span className="block truncate text-xs text-muted">{[e.target_label, e.business_name, e.actor_name].filter(Boolean).join(' · ')}</span>
                </span>
                <span className="shrink-0 text-xs text-muted">{relativeTime(e.created_at)}</span>
              </li>
            ))}
          </ul>
        ))}
      </CardBody>
    </Card>
  )
}

type SubscriptionCounts = NonNullable<ReturnType<typeof usePlatformDashboard>['data']>['subscriptions']

// Status colours (good / warning / serious / critical / neutral); identity is also carried by the legend labels.
function SubscriptionStatusCard({ s, total }: { s: SubscriptionCounts; total: number }) {
  const segments = [
    { key: 'active', label: 'Active', value: s.active, color: '#1d9b4b' },
    { key: 'expiring', label: 'Expiring Soon', value: s.expiring_soon, color: '#f5a524' },
    { key: 'cancelling', label: 'Cancelling', value: s.cancelling, color: '#8b5cf6' },
    { key: 'past_due', label: 'Past Due', value: s.past_due, color: '#e5484d' },
    { key: 'lapsed', label: 'Expired / Cancelled', value: s.lapsed, color: '#94a3b8' },
    { key: 'none', label: 'Never Subscribed', value: s.never_subscribed, color: '#cbd5e1' },
  ].filter((x) => x.value > 0)
  return (
    <Card>
      <CardHeader title="Subscription Status" description="Current subscription distribution" />
      <CardBody>
        {segments.length === 0 ? <Empty text="No businesses yet." /> : (
          <div className="flex items-center gap-6">
            <Donut segments={segments} centerValue={total.toLocaleString()} centerLabel="Total" size={160} thickness={24} />
            <DonutLegend segments={segments} />
          </div>
        )}
      </CardBody>
    </Card>
  )
}

function Empty({ text }: { text: string }) {
  return <p className="px-5 py-8 text-center text-sm text-muted">{text}</p>
}

export function AdminDashboardPage() {
  const { user } = useAuth()
  const granted = new Set(user?.platform_permissions ?? [])
  const [range, setRange] = useState(() => presetRange('30'))
  const dashboard = usePlatformDashboard(range)
  const system = useSystemStatus(granted.has('platform.system.view'))
  const d = dashboard.data
  const [currency, setCurrency] = useState<string | null>(null)
  const activeCurrency = currency ?? d?.revenue_series.currencies[0] ?? null
  const revenuePoints = useMemo(
    () => (d && activeCurrency ? d.revenue_series.months.map((m) => ({ date: m.month, value: Number(m.totals[activeCurrency] ?? 0) })) : []),
    [d, activeCurrency],
  )

  return (
    <RequirePlatformPermission code="platform.dashboard.view">
      <div className="mb-4 grid items-center gap-4 lg:grid-cols-[minmax(0,1fr)_auto_20rem] [&>*]:min-w-0">
        <section className="py-2">
          <h1 className="text-[28px] leading-tight font-bold tracking-tight text-ink">Welcome back, {user?.full_name.split(' ')[0]}! <span aria-hidden>👋</span></h1>
          <p className="mt-1 text-[15px] text-body">Here's what's happening on your platform today. All figures come from live data.</p>
          <div className="mt-3"><RangePicker value={range} onChange={setRange} /></div>
        </section>
        <img src={heroArt} alt="" aria-hidden className="pointer-events-none hidden h-[104px] w-auto xl:block xl:[mask-image:radial-gradient(closest-side,black_70%,transparent)]" />
        <Card className="px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[16px] font-bold text-ink">Platform Status</h2>
            {granted.has('platform.system.view') && <Link to="/admin/system" className="text-[13px] font-medium text-brand-700 hover:underline">View Details →</Link>}
          </div>
          <div className="mt-2">
            {!granted.has('platform.system.view') ? <p className="text-sm text-body">Not available for your role.</p>
              : system.isPending ? <Spinner /> : system.isError ? <p className="text-sm text-red-600">Status check failed.</p> : (
                <p className={cn('inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-semibold', system.data.ok ? 'bg-[#dcf7e5] text-[#14a04a]' : 'bg-[#fff1d6] text-[#b45309]')}>
                  {system.data.ok ? <CircleCheck className="size-4" aria-hidden /> : <CircleAlert className="size-4" aria-hidden />}
                  {system.data.ok ? 'All Systems Operational' : `${system.data.checks.filter((c) => !c.ok).length} check(s) need attention`}
                </p>
              )}
          </div>
        </Card>
      </div>

      {dashboard.isPending ? <Spinner label="Loading platform data…" /> : dashboard.isError ? <ErrorState error={dashboard.error} onRetry={() => dashboard.refetch()} /> : d && (
        <div className={cn('space-y-4', dashboard.isFetching && 'opacity-70 transition-opacity')}>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 2xl:grid-cols-6">
            <StatCard icon={Building2} label="Total Businesses" value={d.businesses.total} hint={`+${d.businesses.new} in range · ${d.businesses.suspended} suspended`} />
            <StatCard icon={Crown} tone="amber" label="Active Subscriptions" value={d.subscriptions.active} hint={`${d.subscriptions.past_due} past due`} />
            <StatCard icon={Users} tone="blue" label="Total Users" value={d.users.total} hint={`+${d.users.new} in range`} />
            <StatCard icon={IndianRupee} tone="green" label="Revenue (verified)"
              value={d.revenue.length === 0 ? '—' : d.revenue.map((r) => formatPrice(r.gross, r.currency)).join(' · ')}
              hint={d.revenue.length === 0 ? `No live payments in range${d.test_payments ? ` · ${d.test_payments} test` : ''}` : `${d.revenue.reduce((n, r) => n + r.payments, 0)} payments${d.test_payments ? ` · ${d.test_payments} test excluded` : ''}`} />
            <StatCard icon={Mail} tone="pink" label="New Enquiries" value={d.enquiries.total} hint={`${d.enquiries.converted} converted`} />
            <StatCard icon={Headset} tone="violet" label="Open Support Tickets" value={d.support.open} hint={`${d.support.unassigned} unassigned`} />
          </div>

          <div className="grid gap-4 xl:grid-cols-3 [&>*]:min-w-0">
            <Card>
              <CardHeader title="Revenue Overview" description="Captured, non-test payments per month (incl. tax). Refunds are not tracked."
                action={d.revenue_series.currencies.length > 1 && (
                  <select aria-label="Currency" value={activeCurrency ?? ''} onChange={(e) => setCurrency(e.target.value)} className="h-8 rounded-lg border border-border px-2 text-sm">
                    {d.revenue_series.currencies.map((c) => <option key={c}>{c}</option>)}
                  </select>
                )} />
              <CardBody>
                {revenuePoints.length === 0 ? <Empty text="No verified revenue in the last 6 months." /> : (
                  <TrendChart data={revenuePoints} kind="column" label={`Revenue (${activeCurrency})`} unit="month" formatDate={shortMonth}
                    formatValue={(v) => formatPrice(String(v), activeCurrency!) ?? String(v)} />
                )}
              </CardBody>
            </Card>
            <SubscriptionStatusCard s={d.subscriptions} total={d.businesses.total} />
            <Card>
              <CardHeader title="Business Growth" description="New businesses registered per month" />
              <CardBody>
                {d.business_growth.every((m) => m.count === 0) ? <Empty text="No registrations in the last 6 months." /> : (
                  <TrendChart data={d.business_growth.map((m) => ({ date: m.month, value: m.count }))} label="New businesses" unit="month" formatDate={shortMonth} />
                )}
              </CardBody>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] [&>*]:min-w-0">
            <RecentTabs data={d} />
            <Card>
              <CardHeader title="Subscription Expiry (Next 7 Days)" action={<Link to="/admin/subscriptions" className="text-sm font-medium text-brand-700 hover:underline">View All →</Link>} />
              <CardBody className="p-0">
                {d.expiring.length === 0 ? <Empty text="Nothing expires in the next 7 days." /> : (
                  <ul className="divide-y divide-border">
                    {d.expiring.map((e) => {
                      const days = Math.max(0, Math.ceil((new Date(e.ends_at).getTime() - Date.now()) / 86_400_000))
                      return (
                        <li key={e.business_id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                          <span className="min-w-0">
                            <Link to={`/admin/businesses?business=${e.business_id}`} className="block truncate font-medium hover:text-brand-700">{e.business_name}</Link>
                            <span className="text-xs text-muted">{e.plan_name}{e.cancelling && ' · cancelling'}</span>
                          </span>
                          <span className="shrink-0 rounded-md bg-[#ffe1e8] px-2.5 py-1 text-xs font-medium text-[#e11d48]">{days === 0 ? 'today' : `${days} day${days === 1 ? '' : 's'}`}</span>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </CardBody>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-3 [&>*]:min-w-0">
            <Card>
              <CardHeader title="Top Plans by Subscribers" />
              <CardBody><BarList rows={d.top_plans.map((p) => ({ key: p.plan_name, label: p.plan_name, value: p.subscribers }))} empty="No active subscriptions." /></CardBody>
            </Card>
            <Card>
              <CardHeader title="Top Business Categories" />
              <CardBody><BarList rows={d.top_categories.map((c) => ({ key: c.category, label: categoryLabel(c.category), value: c.count }))} empty="No businesses yet." /></CardBody>
            </Card>
            <Card>
              <CardHeader title="Quick Actions" />
              <CardBody>
                <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                  {QUICK.filter((q) => granted.has(q.requires)).map(({ to, label, icon: Icon }) => (
                    <li key={to}>
                      <Link to={to} className="flex h-[70px] flex-col items-center justify-center gap-1.5 rounded-xl bg-[#eef4fd] px-1 text-center text-[11.5px] font-medium text-ink hover:bg-[#dcebfd]">
                        <Icon className="size-[22px] text-brand-700" strokeWidth={1.8} aria-hidden /> {label}
                      </Link>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 flex items-center gap-1.5 text-xs text-muted">
                  <Package className="size-3.5" aria-hidden /> {d.content.published_catalogues} of {d.content.catalogues} catalogues live · {d.content.products.toLocaleString()} products
                </p>
                <p className="mt-1 flex items-center gap-1.5 text-xs text-muted"><HardDrive className="size-3.5" aria-hidden /> {formatBytes(d.content.storage_bytes)} media stored</p>
                <p className="mt-1 flex items-center gap-1.5 text-xs text-muted"><BarChart3 className="size-3.5" aria-hidden /> Range {d.range.from} → {d.range.to} ({d.range.timezone})</p>
              </CardBody>
            </Card>
          </div>
        </div>
      )}
    </RequirePlatformPermission>
  )
}
