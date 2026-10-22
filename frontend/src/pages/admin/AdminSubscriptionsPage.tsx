import {
  AlertTriangle, Building2, CalendarDays, CalendarX2, CircleX, CreditCard, ExternalLink, Eye, PauseCircle, PlayCircle, Repeat, UserCheck, X,
} from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  useAdminCancelSubscription, useAdminInvoices, useAdminIssueInvoice, useAdminPlans, useAdminSubscription, useAdminSubscriptionAction,
  useAdminSubscriptionPayments, useAdminSubscriptions, useAdminSubscriptionSummary, type AdminListParams,
} from '@/api/billing'
import { useToast } from '@/components/ui/toast'
import { ReasonDialog } from '@/features/platform/ReasonDialog'
import { useAdminBusiness } from '@/api/platform'
import { CATEGORICAL, OTHERS, shortMonth } from '@/components/charts/chartUtils'
import { Donut, DonutLegend } from '@/components/charts/Donut'
import { GroupedBars } from '@/components/charts/GroupedBars'
import { CheckDot, PageHero } from '@/components/panel/PageHero'
import { StatCard, StatGrid } from '@/components/panel/StatCard'
import { FilterSelect, SearchInput, Toolbar } from '@/components/panel/Toolbar'
import { Button } from '@/components/ui/Button'
import { buttonClasses, rowIconButton } from '@/components/ui/buttonStyles'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Badge, EmptyState, ErrorState, Spinner } from '@/components/ui/Feedback'
import { Checkbox } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { Pagination } from '@/components/ui/Pagination'
import { useAuth } from '@/features/auth/AuthContext'
import { formatDate, formatMoney, intervalLabel, limitLines, PAYMENT_KIND, PAYMENT_STATUS, SUBSCRIPTION_STATUS } from '@/features/billing/format'
import { formatBytes } from '@/features/content/format'
import { actionLabel, relativeTime } from '@/features/workspace/format'
import { RequirePlatformPermission } from '@/routes/guards'
import type { AdminSubscription, SubscriptionStatus } from '@/types/billing'
import { cn } from '@/utils/cn'

// Trend colours: validated with the dataviz palette checker (worst CVD pair 7.6 ΔE → always shown with a labelled legend).
const TREND = [
  { key: 'new', label: 'New', color: '#2f6df6' },
  { key: 'renewed', label: 'Renewed', color: '#1d9b4b' },
  { key: 'ended', label: 'Expired / Cancelled', color: '#e0408f' },
] as const

const TABS: { key: string; label: string; count: (c: NonNullable<ReturnType<typeof useAdminSubscriptionSummary>['data']>['counts']) => number }[] = [
  { key: '', label: 'All Subscriptions', count: (c) => c.total },
  { key: 'active', label: 'Active', count: (c) => c.active },
  { key: 'past_due', label: 'Past Due', count: (c) => c.past_due },
  { key: 'expired', label: 'Expired', count: (c) => c.expired },
  { key: 'cancelled', label: 'Cancelled', count: (c) => c.cancelled },
  { key: 'suspended', label: 'Suspended', count: (c) => c.suspended },
]

function CancelModal({ sub, onClose }: { sub: AdminSubscription | null; onClose: () => void }) {
  const cancel = useAdminCancelSubscription()
  const [immediately, setImmediately] = useState(false)
  if (!sub) return null
  return (
    <Modal open onClose={onClose} title={`Cancel ${sub.business.name}'s subscription?`}
      description="This is recorded in the application log. No refund is issued automatically."
      footer={<>
        <Button variant="secondary" onClick={onClose}>Keep</Button>
        <Button variant="danger" loading={cancel.isPending} onClick={() => cancel.mutate({ id: sub.id, immediately }, { onSuccess: onClose })}>Cancel subscription</Button>
      </>}>
      <Checkbox label="End access immediately (otherwise at the end of the current period)" checked={immediately} onChange={(e) => setImmediately(e.target.checked)} />
      {cancel.isError && <p className="mt-3 text-sm text-red-600">{cancel.error.message}</p>}
    </Modal>
  )
}

const DETAIL_TABS = ['Overview', 'Invoices', 'Users', 'Activity'] as const

const PAYMENT_TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = { captured: 'success', created: 'warning', failed: 'danger', expired: 'neutral' }

/** Schedule the plan the business moves to at period end. Nothing is charged here; the owner pays for it at renewal. */
function ChangePlanModal({ sub, onClose }: { sub: AdminSubscription; onClose: () => void }) {
  const plans = useAdminPlans()
  const act = useAdminSubscriptionAction()
  const toast = useToast()
  const [planId, setPlanId] = useState('')
  const options = (plans.data?.results ?? []).filter((p) => p.is_active && p.id !== sub.plan.id && p.currency === sub.plan_currency)
  return (
    <Modal open onClose={onClose} title={`Change plan for ${sub.business.name}`}
      description="The new plan starts at the end of the current period, once the business owner has paid for it from their billing page. Nothing is charged now, and access does not change until then."
      footer={<>
        <Button variant="secondary" onClick={onClose}>Close</Button>
        <Button disabled={!planId} loading={act.isPending}
          onClick={() => act.mutate({ id: sub.id, action: 'schedule-change', plan_id: planId }, { onSuccess: () => { toast.show('Plan change scheduled.'); onClose() } })}>
          Schedule change
        </Button>
      </>}>
      {plans.isPending ? <Spinner /> : options.length === 0 ? <p className="text-sm text-body">No other active plans in {sub.plan_currency}.</p> : (
        <label className="block text-sm font-medium text-ink">New plan
          <select value={planId} onChange={(e) => setPlanId(e.target.value)} className="mt-1.5 block h-10 w-full rounded-lg border border-[#d5e5fa] bg-white px-3 text-sm">
            <option value="">Choose a plan</option>
            {options.map((p) => <option key={p.id} value={p.id}>{p.name} — {formatMoney(p.price, p.currency)} / {intervalLabel(p.interval)}</option>)}
          </select>
        </label>
      )}
      {act.isError && <p role="alert" className="mt-3 text-sm text-red-600">{act.error.message}</p>}
    </Modal>
  )
}

/** Docked detail panel: the subscription (fetched by id, so a deep link works on any page) plus business, payments and invoices. */
function SubscriptionPanel({ id, onClose, onCancel, canManage, canInvoices, canReconcile }: {
  id: string; onClose: () => void; onCancel: (s: AdminSubscription) => void; canManage: boolean; canInvoices: boolean; canReconcile: boolean
}) {
  const [tab, setTab] = useState<(typeof DETAIL_TABS)[number]>('Overview')
  const [dialog, setDialog] = useState<'change' | 'suspend' | 'reactivate' | null>(null)
  const detail = useAdminSubscription(id)
  const sub = detail.data
  const business = useAdminBusiness(sub?.business.id ?? null)
  const invoices = useAdminInvoices({ business: sub?.business.id, page_size: 10 }, Boolean(sub) && canInvoices && tab === 'Invoices')
  const payments = useAdminSubscriptionPayments(id, tab === 'Invoices')
  const act = useAdminSubscriptionAction()
  const issue = useAdminIssueInvoice()
  const toast = useToast()

  if (detail.isPending) return <aside className="rounded-2xl bg-white p-4 shadow-panel" aria-label="Subscription details"><Spinner /></aside>
  if (detail.isError || !sub) {
    return (
      <aside className="space-y-3 rounded-2xl bg-white p-4 shadow-panel" aria-label="Subscription details">
        <div className="flex justify-end"><button type="button" onClick={onClose} aria-label="Close details" className="rounded p-1 text-ink hover:bg-canvas"><X className="size-5" /></button></div>
        <ErrorState error={detail.error} onRetry={() => detail.refetch()} />
      </aside>
    )
  }

  const b = business.data
  const status = SUBSCRIPTION_STATUS[sub.status]
  const end = sub.current_period_end ? new Date(sub.current_period_end) : null
  const daysLeft = end ? Math.ceil((end.getTime() - Date.now()) / 86_400_000) : null
  const isCurrent = ['active', 'past_due'].includes(sub.status)
  const usage = b ? [
    { label: 'Products', used: b.product_count, limit: sub.limits.max_products },
    { label: 'Catalogues', used: b.catalogue_count, limit: sub.limits.max_catalogues },
    { label: 'Team Members', used: b.member_count, limit: sub.limits.max_staff },
  ] : []
  const tabs = DETAIL_TABS.filter((t) => t !== 'Invoices' || canInvoices)

  return (
    <aside className="rounded-2xl bg-white p-4 shadow-panel" aria-label="Subscription details">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[17px] font-bold text-ink">Subscription Details</h2>
        <button type="button" onClick={onClose} aria-label="Close details" className="rounded p-1 text-ink hover:bg-canvas"><X className="size-5" /></button>
      </div>
      <div className="flex items-start gap-3">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-[#e3effd] text-brand-700"><Building2 className="size-6" aria-hidden /></span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-bold text-ink">{sub.business.name}</p>
          <p className="truncate text-[12px] text-body">{sub.business.slug}</p>
          {b && <p className="truncate text-[12px] text-body">Owner: {b.owner_name}</p>}
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge tone={status.tone}>{status.label}</Badge>
          {sub.suspended_at && <Badge tone="danger">Suspended</Badge>}
        </div>
      </div>
      {sub.suspended_at && (
        <p role="status" className="mt-3 rounded-lg bg-[#ffe9ec] px-3 py-2 text-[12.5px] text-[#b4233c]">
          Suspended {formatDate(sub.suspended_at)} — paid access is withheld. Reason: {sub.suspension_reason}
        </p>
      )}
      <div role="tablist" aria-label="Detail sections" className="mt-3 flex border-b border-border">
        {tabs.map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
            className={cn('flex-1 border-b-2 px-1 py-2 text-[12.5px] font-medium', tab === t ? 'border-brand-700 text-brand-700' : 'border-transparent text-ink hover:text-brand-700')}>{t}</button>
        ))}
      </div>
      {tab === 'Overview' && (
        <div className="space-y-4 pt-3">
          <section>
            <h3 className="mb-2 text-[14px] font-bold text-ink">Subscription Information</h3>
            <dl className="grid grid-cols-[110px_1fr] gap-y-1.5 text-[13px] [&>*]:min-w-0">
              <dt className="text-body">Plan Name</dt><dd className="text-ink">{sub.plan_name}</dd>
              <dt className="text-body">Plan Price</dt><dd className="text-ink">{formatMoney(sub.plan_price, sub.plan_currency)} / {intervalLabel(sub.plan_interval)} <span className="text-[11.5px] text-body">(price at purchase)</span></dd>
              <dt className="text-body">Start Date</dt><dd className="text-ink">{formatDate(sub.current_period_start)}</dd>
              <dt className="text-body">Period End</dt>
              <dd className="text-ink">
                {formatDate(sub.current_period_end)}
                {daysLeft !== null && daysLeft >= 0 && isCurrent && <span className="ml-1 rounded bg-[#dcf7e5] px-1.5 text-[12px] text-[#14a04a]">{daysLeft} days left</span>}
              </dd>
              {sub.grace_until && sub.status === 'past_due' && <><dt className="text-body">Grace Until</dt><dd className="text-amber-700">{formatDate(sub.grace_until)}</dd></>}
              <dt className="text-body">Renewal</dt>
              <dd className="text-ink">{sub.cancel_at_period_end ? 'Cancels at period end' : 'Manual — the owner pays each period from their billing page'}</dd>
              {sub.pending_plan && <><dt className="text-body">Next Plan</dt><dd className="text-ink">{sub.pending_plan.name} <span className="text-[11.5px] text-body">(at period end, once paid)</span></dd></>}
            </dl>
          </section>
          <section>
            <h3 className="mb-2 text-[14px] font-bold text-ink">Usage Limits</h3>
            {business.isPending ? <Spinner /> : business.isError ? <p className="text-sm text-red-600">Usage could not be loaded.</p> : (
              <ul className="space-y-2">
                {usage.map((u) => {
                  const pct = u.limit ? Math.min(100, Math.round((u.used / u.limit) * 100)) : null
                  return (
                    <li key={u.label} className="grid grid-cols-[96px_60px_1fr_34px] items-center gap-2 text-[12.5px] text-ink [&>*]:min-w-0">
                      <span className="text-body">{u.label}</span>
                      <span className="tabular-nums">{u.used} / {u.limit ?? '∞'}</span>
                      <span className="h-2 overflow-hidden rounded-full bg-[#e8eef7]"><span className="block h-full rounded-full bg-brand-700" style={{ width: `${pct ?? 0}%` }} /></span>
                      <span className="text-right text-body tabular-nums">{pct === null ? '—' : `${pct}%`}</span>
                    </li>
                  )
                })}
                {b && (
                  <li className="grid grid-cols-[96px_1fr] gap-2 text-[12.5px] text-ink [&>*]:min-w-0">
                    <span className="text-body">Media Storage</span>
                    <span>{formatBytes(b.storage_bytes)}{sub.limits.storage_limit_mb ? ` / ${formatBytes(sub.limits.storage_limit_mb * 1024 * 1024)}` : ''}</span>
                  </li>
                )}
              </ul>
            )}
          </section>
          <section>
            <h3 className="mb-2 text-[14px] font-bold text-ink">Plan Features <span className="text-[11.5px] font-normal text-body">(snapshot at purchase)</span></h3>
            <ul className="space-y-1.5 rounded-xl bg-[#f5f9ff] p-3 text-[13px] text-ink">
              {limitLines(sub.limits).map((l) => <li key={l} className="flex items-center gap-2"><CheckDot className="size-4" />{l}</li>)}
            </ul>
          </section>
          <p className="rounded-lg bg-[#f5f9ff] px-3 py-2 text-[12px] text-body">
            Renew and auto-renew are not available to admins: a period is only ever extended by a verified payment from the business,
            and the payment providers support one-time payments only (no stored-card recurring charges).
          </p>
        </div>
      )}
      {tab === 'Invoices' && (
        <div className="space-y-4 pt-3">
          <section>
            <h3 className="mb-2 text-[14px] font-bold text-ink">Payments for this subscription</h3>
            {payments.isPending ? <Spinner /> : payments.isError ? <p className="text-sm text-red-600">Payments could not be loaded.</p> : payments.data.results.length ? (
              <ul className="divide-y divide-border text-[13px]">
                {payments.data.results.map((pay) => {
                  const missingInvoice = pay.status === 'captured' && pay.applied_at && !pay.invoice_id
                  return (
                    <li key={pay.id} className="flex items-center justify-between gap-2 py-2">
                      <span className="min-w-0">
                        <span className="font-medium text-ink">{formatMoney(pay.amount, pay.currency)}</span>
                        <span className="block text-[12px] text-body">{PAYMENT_KIND[pay.kind]} · {formatDate(pay.paid_at ?? pay.created_at)}</span>
                      </span>
                      <span className="flex flex-col items-end gap-1">
                        <span className="flex gap-1"><Badge tone={PAYMENT_TONE[pay.status] ?? 'neutral'}>{PAYMENT_STATUS[pay.status].label}</Badge>{pay.is_test && <Badge tone="warning">Test</Badge>}</span>
                        {missingInvoice && canReconcile && (
                          <button type="button" disabled={issue.isPending} className="text-[12px] font-medium text-brand-700 hover:underline disabled:opacity-60"
                            onClick={() => issue.mutate(pay.id, { onSuccess: (r) => toast.show(r.created ? `Invoice ${r.invoice.number} issued.` : 'Invoice already existed.') })}>
                            Generate invoice
                          </button>
                        )}
                      </span>
                    </li>
                  )
                })}
              </ul>
            ) : <p className="py-3 text-center text-sm text-body">No payments for this subscription.</p>}
            {issue.isError && <p role="alert" className="mt-2 text-sm text-red-600">{issue.error.message}</p>}
            <p className="mt-2 text-[11.5px] text-body">Invoices are issued automatically for verified payments; "Generate invoice" appears only if one is missing.</p>
          </section>
          <section>
            <h3 className="mb-2 text-[14px] font-bold text-ink">Business invoices</h3>
            {invoices.isPending ? <Spinner /> : invoices.isError ? <p className="text-sm text-red-600">Invoices could not be loaded.</p> : invoices.data?.results.length ? (
              <ul className="divide-y divide-border text-[13px]">
                {invoices.data.results.map((inv) => (
                  <li key={inv.id} className="flex items-center justify-between gap-2 py-2">
                    <span><span className="font-medium text-ink">{inv.number}</span><span className="block text-[12px] text-body">{formatDate(inv.issued_at)}</span></span>
                    <span className="text-right"><span className="font-semibold text-ink">{formatMoney(inv.total, inv.currency)}</span>{inv.is_test && <span className="block text-[11px] text-amber-700">Test</span>}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="py-3 text-center text-sm text-body">No invoices for this business.</p>}
          </section>
        </div>
      )}
      {tab === 'Users' && (
        <div className="pt-3">
          {business.isPending ? <Spinner /> : b?.members.length ? (
            <ul className="divide-y divide-border text-[13px]">
              {b.members.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-2 py-2">
                  <span className="min-w-0"><span className="block truncate font-medium text-ink">{m.name}</span><span className="block truncate text-[12px] text-body">{m.email}</span></span>
                  <Badge tone={m.is_owner ? 'brand' : 'neutral'}>{m.role}</Badge>
                </li>
              ))}
            </ul>
          ) : <p className="py-6 text-center text-sm text-body">No members.</p>}
        </div>
      )}
      {tab === 'Activity' && (
        <div className="pt-3">
          {business.isPending ? <Spinner /> : b?.activity.length ? (
            <ul className="space-y-2 text-[13px]">
              {b.activity.slice(0, 10).map((e) => (
                <li key={e.id} className="flex justify-between gap-2">
                  <span className="min-w-0"><span className="block text-ink">{actionLabel(e.action)}</span><span className="block truncate text-[12px] text-body">{e.target_label || e.actor_name}</span></span>
                  <span className="shrink-0 text-[11.5px] text-body">{relativeTime(e.created_at)}</span>
                </li>
              ))}
            </ul>
          ) : <p className="py-6 text-center text-sm text-body">No activity recorded.</p>}
        </div>
      )}
      {canManage && isCurrent && (
        <div className="mt-4 grid grid-cols-2 gap-2 border-t border-border pt-4 [&>*]:min-w-0">
          {sub.status === 'active' && !sub.suspended_at && (
            sub.pending_plan ? (
              <Button variant="secondary" size="sm" loading={act.isPending} onClick={() => act.mutate({ id: sub.id, action: 'clear-change' }, { onSuccess: () => toast.show('Scheduled change removed.') })}>Undo plan change</Button>
            ) : (
              <Button variant="secondary" size="sm" icon={<Repeat className="size-4" />} onClick={() => setDialog('change')}>Change Plan</Button>
            )
          )}
          {sub.suspended_at ? (
            <Button variant="secondary" size="sm" icon={<PlayCircle className="size-4" />} onClick={() => setDialog('reactivate')}>Reactivate</Button>
          ) : (
            <Button variant="secondary" size="sm" className="border-amber-300 text-amber-700 hover:bg-amber-50" icon={<PauseCircle className="size-4" />} onClick={() => setDialog('suspend')}>Suspend</Button>
          )}
        </div>
      )}
      {act.isError && dialog === null && <p role="alert" className="mt-2 text-sm text-red-600">{act.error.message}</p>}
      <div className="mt-2 grid grid-cols-2 gap-2 [&>*]:min-w-0">
        <Link to={`/admin/businesses?business=${sub.business.id}`} className={buttonClasses('primary', 'md', 'px-2 whitespace-nowrap')}><ExternalLink className="size-4" aria-hidden /> Business</Link>
        {canManage && ['active', 'past_due', 'scheduled'].includes(sub.status) ? (
          <Button variant="secondary" className="border-red-300 text-red-600 hover:bg-red-50" icon={<CircleX className="size-4" />} onClick={() => onCancel(sub)}>Cancel</Button>
        ) : <span />}
      </div>
      {dialog === 'change' && <ChangePlanModal sub={sub} onClose={() => setDialog(null)} />}
      {(dialog === 'suspend' || dialog === 'reactivate') && (
        <ReasonDialog
          title={dialog === 'suspend' ? `Suspend ${sub.business.name}'s subscription?` : `Reactivate ${sub.business.name}'s subscription?`}
          description={dialog === 'suspend'
            ? 'Paid features and public catalogues stop working for this business until you reactivate it. The subscription keeps its status and dates, nothing is refunded, and open checkouts are cancelled. This is not a business suspension: members can still sign in. The owner is notified.'
            : 'Paid access is restored immediately for the rest of the current period. The owner is notified.'}
          confirmLabel={dialog === 'suspend' ? 'Suspend' : 'Reactivate'}
          tone={dialog === 'suspend' ? 'danger' : 'primary'}
          loading={act.isPending}
          error={act.error?.message}
          onClose={() => { act.reset(); setDialog(null) }}
          onConfirm={(reason) => act.mutate({ id: sub.id, action: dialog, reason }, {
            onSuccess: () => { toast.show(dialog === 'suspend' ? 'Subscription suspended.' : 'Subscription reactivated.'); setDialog(null) },
          })}
        />
      )}
    </aside>
  )
}

export function AdminSubscriptionsPage() {
  const { user } = useAuth()
  const [params, setParams] = useState<AdminListParams>({ page: 1, search: '', status: '' })
  // "All" = every paid subscription (unpaid/abandoned checkouts excluded), the same rows the summary total counts.
  // "Suspended" is a flag on active/past-due subscriptions, not a status, so it uses its own filter.
  const suspendedTab = params.status === 'suspended'
  const subs = useAdminSubscriptions({
    ...params,
    search: params.search || undefined,
    status: params.status && !suspendedTab ? params.status : undefined,
    paid: params.status && !suspendedTab ? undefined : 'true',
    suspended: suspendedTab ? 'true' : undefined,
  })
  const summary = useAdminSubscriptionSummary()
  const [searchParams, setSearchParams] = useSearchParams()
  const [cancelling, setCancelling] = useState<AdminSubscription | null>(null)
  const canManage = Boolean(user?.platform_permissions.includes('platform.subscription.manage'))
  const canInvoices = Boolean(user?.platform_permissions.includes('platform.invoice.view'))
  const canReconcile = Boolean(user?.platform_permissions.includes('platform.payment.reconcile'))
  const openId = searchParams.get('subscription')
  const rows = subs.data?.results ?? []
  const selected = openId
  const c = summary.data?.counts
  const pct = (n?: number) => (c?.total && n !== undefined ? `${Math.round((n / c.total) * 100)}% of total` : undefined)
  const plans = summary.data?.plans ?? []
  const planSegments = [
    ...plans.slice(0, CATEGORICAL.length).map((p, i) => ({ key: p.plan_name, label: p.plan_name, value: p.count, color: CATEGORICAL[i]! })),
    ...(plans.length > CATEGORICAL.length ? [{ key: 'others', label: 'Others', value: plans.slice(CATEGORICAL.length).reduce((n, p) => n + p.count, 0), color: OTHERS }] : []),
  ]
  const months = summary.data?.months ?? []

  return (
    <RequirePlatformPermission code="platform.subscription.view">
      <PageHero icon={CalendarDays} title="Subscriptions Management" description="Manage all subscription plans, renewals and billing across the platform." />
      <div className={cn('grid gap-4 [&>*]:min-w-0', selected && 'xl:grid-cols-[minmax(0,1fr)_21rem]')}>
        <div className="min-w-0">
          <StatGrid cols={5}>
            <StatCard icon={Building2} label="Total Subscriptions" value={c?.total ?? '—'} loading={summary.isPending} hint="Excl. unpaid checkouts" />
            <StatCard icon={UserCheck} tone="green" label="Active" value={c?.active ?? '—'} loading={summary.isPending} hint={pct(c?.active)} />
            <StatCard icon={AlertTriangle} tone="amber" label="Expiring Soon" value={c?.expiring_soon ?? '—'} loading={summary.isPending} hint="Next 7 days" />
            <StatCard icon={CalendarX2} tone="red" label="Expired" value={c?.expired ?? '—'} loading={summary.isPending} hint={pct(c?.expired)} />
            <StatCard icon={CircleX} tone="slate" label="Cancelled" value={c?.cancelled ?? '—'} loading={summary.isPending} hint={pct(c?.cancelled)} />
          </StatGrid>

          <div className="mb-4 grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] [&>*]:min-w-0">
            <Card>
              <CardHeader title="Subscription Trend" description="New, renewed and expired subscriptions (last 6 months)"
                action={<ul className="flex flex-wrap gap-3 text-[12px] text-ink">{TREND.map((t) => <li key={t.key} className="flex items-center gap-1.5"><span className="size-2.5 rounded-full" style={{ background: t.color }} aria-hidden />{t.label}</li>)}</ul>} />
              <CardBody>
                {summary.isPending ? <Spinner /> : months.every((m) => !m.new && !m.renewed && !m.ended) ? (
                  <p className="py-10 text-center text-sm text-body">No subscription activity in the last 6 months.</p>
                ) : (
                  <GroupedBars label="Subscriptions per month" labels={months.map((m) => shortMonth(m.month))}
                    series={TREND.map((t) => ({ key: t.key, label: t.label, color: t.color, values: months.map((m) => m[t.key]) }))} />
                )}
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Plan Distribution" description="Current subscriptions by plan" />
              <CardBody>
                {planSegments.length === 0 ? <p className="py-10 text-center text-sm text-body">No current subscriptions.</p> : (
                  <div className="flex items-center gap-6">
                    <Donut segments={planSegments} centerValue={plans.reduce((n, p) => n + p.count, 0).toLocaleString()} centerLabel="Total" size={150} />
                    <DonutLegend segments={planSegments} />
                  </div>
                )}
              </CardBody>
            </Card>
          </div>

          <div className="mb-3 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Subscription status">
            {TABS.map((t) => (
              <button key={t.key || 'all'} type="button" role="tab" aria-selected={(params.status ?? '') === t.key}
                onClick={() => setParams({ ...params, status: t.key, page: 1 })}
                className={cn('h-10 shrink-0 rounded-lg px-4 text-sm font-medium', (params.status ?? '') === t.key ? 'bg-brand-700 text-white shadow-pill' : 'bg-white text-ink ring-1 ring-[#d5e5fa] hover:bg-brand-50')}>
                {t.label}{c ? ` (${t.count(c)})` : ''}
              </button>
            ))}
          </div>
          <Toolbar>
            <SearchInput value={params.search ?? ''} onChange={(search) => setParams({ ...params, search, page: 1 })} placeholder="Search by business name, plan…" />
            <FilterSelect label="Filter by status" value={params.status ?? ''} onChange={(status) => setParams({ ...params, status, page: 1 })}
              options={[{ value: '', label: 'All paid' }, ...Object.entries(SUBSCRIPTION_STATUS).map(([key, { label }]) => ({ value: key, label })), { value: 'suspended', label: 'Suspended' }]} />
          </Toolbar>

          {subs.isPending ? <Spinner /> : subs.isError ? <ErrorState error={subs.error} onRetry={() => subs.refetch()} /> : rows.length === 0 ? (
            <EmptyState icon={CreditCard} title="No subscriptions found" />
          ) : (
            <>
              <Card>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm text-ink">
                    <thead className="bg-thead text-[13px] font-semibold">
                      <tr>
                        <th scope="col" className="w-10 px-4 py-3">#</th>
                        <th scope="col" className="px-3 py-3">Business Name</th>
                        <th scope="col" className="px-3 py-3">Plan</th>
                        <th scope="col" className="hidden px-3 py-3 lg:table-cell">Start Date</th>
                        <th scope="col" className="px-3 py-3">Expiry Date</th>
                        <th scope="col" className="hidden px-3 py-3 md:table-cell">Amount</th>
                        <th scope="col" className="px-3 py-3">Status</th>
                        <th scope="col" className="px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {rows.map((s, i) => {
                        const st = SUBSCRIPTION_STATUS[s.status as SubscriptionStatus]
                        const soon = s.status === 'active' && s.current_period_end && new Date(s.current_period_end).getTime() - Date.now() < 7 * 86_400_000
                        return (
                          <tr key={s.id} className={cn('cursor-pointer hover:bg-canvas', openId === s.id && 'bg-brand-50/60')} onClick={() => setSearchParams({ subscription: s.id })}>
                            <td className="px-4 py-3">{((params.page ?? 1) - 1) * (subs.data?.page_size ?? 0) + i + 1}</td>
                            <td className="px-3 py-3 font-medium">{s.business.name}</td>
                            <td className="px-3 py-3"><span className="rounded-md bg-[#e0ebff] px-2.5 py-1 text-xs font-medium text-[#1f5fe0]">{s.plan_name}</span></td>
                            <td className="hidden px-3 py-3 whitespace-nowrap lg:table-cell">{formatDate(s.current_period_start)}</td>
                            <td className={cn('px-3 py-3 whitespace-nowrap', (soon || ['expired', 'past_due'].includes(s.status)) && 'text-red-600')}>{formatDate(s.current_period_end)}</td>
                            <td className="hidden px-3 py-3 whitespace-nowrap md:table-cell">{formatMoney(s.plan_price, s.plan_currency).replace(/\.00$/, '')}</td>
                            <td className="px-3 py-3">
                              {s.suspended_at ? <Badge tone="danger">Suspended</Badge> : <Badge tone={soon ? 'warning' : st.tone}>{soon ? 'Expiring Soon' : st.label}</Badge>}
                              {s.cancel_at_period_end && <span className="block text-xs text-amber-700">Cancels at period end</span>}
                            </td>
                            <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                              <div className="flex justify-end gap-1.5">
                                <button type="button" className={rowIconButton} aria-label={`View ${s.business.name}`} title="View" onClick={() => setSearchParams({ subscription: s.id })}><Eye className="size-4" /></button>
                                <Link to={`/admin/businesses?business=${s.business.id}`} className={rowIconButton} aria-label={`Open business ${s.business.name}`} title="Open business"><ExternalLink className="size-4" /></Link>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
              <Pagination page={params.page ?? 1} totalPages={subs.data.total_pages} count={subs.data.count} pageSize={subs.data.page_size} noun="subscriptions" onPage={(page) => setParams({ ...params, page })} />
            </>
          )}
        </div>
        {selected && (
          <div className="xl:sticky xl:top-20 xl:self-start">
            <SubscriptionPanel id={selected} onClose={() => setSearchParams({})} onCancel={setCancelling} canManage={canManage} canInvoices={canInvoices} canReconcile={canReconcile} />
          </div>
        )}
      </div>
      <CancelModal sub={cancelling} onClose={() => setCancelling(null)} />
    </RequirePlatformPermission>
  )
}
