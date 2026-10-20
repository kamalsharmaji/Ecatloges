import heroArt from '@/assets/reference/hero-subscription.webp'
import { BookOpen, CalendarClock, CreditCard, Crown, HardDrive, Package, Users, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  useBillingOverview,
  useCancelSubscription,
  useClearScheduledChange,
  usePayments,
  usePlans,
  useResumeSubscription,
  useSubscriptionHistory,
} from '@/api/billing'
import { PageHero } from '@/components/panel/PageHero'
import { Button } from '@/components/ui/Button'
import { buttonClasses } from '@/components/ui/buttonStyles'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { PlanCards, PlanComparison } from '@/features/billing/PlanCards'
import { Alert, Badge, EmptyState, ErrorState, Spinner } from '@/components/ui/Feedback'
import { ConfirmDialog } from '@/components/ui/Modal'
import { Pagination } from '@/components/ui/Pagination'
import { useActiveBusiness } from '@/features/business/BusinessContext'
import {
  formatDate,
  formatMoney,
  intervalLabel,
  PAYMENT_KIND,
  PAYMENT_STATUS,
  SUBSCRIPTION_STATUS,
} from '@/features/billing/format'
import { RequirePermission } from '@/routes/guards'
import type { BillingOverview } from '@/types/billing'

function CurrentPlanCard({ data }: { data: BillingOverview }) {
  const { can } = useActiveBusiness()
  const cancel = useCancelSubscription()
  const resume = useResumeSubscription()
  const clearChange = useClearScheduledChange()
  const [confirmCancel, setConfirmCancel] = useState(false)
  const sub = data.subscription
  const manage = can('subscription.manage')

  if (!sub) {
    return (
      <EmptyState
        icon={CreditCard}
        title="No active plan"
        description="Choose a plan to unlock catalogues, products and your team. There is no free trial; your plan starts once payment is confirmed."
        action={
          manage && (
            <Link to="/app/billing/plans" className={buttonClasses('primary', 'md')}>
              Choose a plan
            </Link>
          )
        }
      />
    )
  }

  const status = SUBSCRIPTION_STATUS[sub.status]
  const error = cancel.error ?? resume.error ?? clearChange.error
  const start = sub.current_period_start ? new Date(sub.current_period_start).getTime() : null
  const end = sub.current_period_end ? new Date(sub.current_period_end).getTime() : null
  const now = Date.now()
  const elapsed = start && end && end > start ? Math.min(100, Math.max(0, Math.round(((now - start) / (end - start)) * 100))) : null
  const daysLeft = end ? Math.max(0, Math.ceil((end - now) / 86_400_000)) : null
  return (
    <Card>
      <CardHeader title="Your Current Subscription" />
      <CardBody className="space-y-4">
        <div className="flex flex-wrap items-start gap-x-8 gap-y-4">
          <div className="flex min-w-[280px] flex-1 items-start gap-4">
            <span className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-[#fff1d6] text-amber-500"><Crown className="size-8 fill-amber-400" aria-hidden /></span>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 text-[19px] font-bold text-ink">{sub.plan_name} <Badge tone={status.tone}>{status.label}</Badge></p>
              <p className="text-[13.5px] text-ink">
                Valid till {formatDate(sub.current_period_end)}{daysLeft !== null && ` (${daysLeft} days left)`}
              </p>
              {elapsed !== null && (
                <div className="mt-2 flex items-center gap-3 text-[12px] text-body">
                  <span className="h-2 w-40 overflow-hidden rounded-full bg-[#e8eef7]"><span className="block h-full rounded-full bg-[#22b45a]" style={{ width: `${elapsed}%` }} /></span>
                  {elapsed}% of current period
                </div>
              )}
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-x-8 gap-y-3 text-[13px] sm:grid-cols-4">
            <div><dt className="text-body">Start Date</dt><dd className="font-semibold text-ink">{formatDate(sub.current_period_start)}</dd></div>
            <div><dt className="text-body">{sub.cancel_at_period_end ? 'Ends On' : 'End Date'}</dt><dd className="font-semibold text-ink">{formatDate(sub.current_period_end)}</dd></div>
            <div><dt className="text-body">Billing Cycle</dt><dd className="font-semibold text-ink">{sub.plan_interval === 'year' ? 'Yearly' : 'Monthly'}</dd></div>
            <div>
              <dt className="text-body">{sub.status === 'past_due' ? 'Access Until' : 'Plan Price'}</dt>
              <dd className={sub.status === 'past_due' ? 'font-semibold text-amber-700' : 'font-semibold text-ink'}>
                {sub.status === 'past_due' ? formatDate(sub.grace_until) : `${formatMoney(sub.plan_price, sub.plan_currency)} / ${intervalLabel(sub.plan_interval)}`}
              </dd>
            </div>
          </dl>
        </div>

        {sub.status === 'past_due' && (
          <Alert tone="warning" title="Payment overdue">
            Your period has ended. Renew before {formatDate(sub.grace_until)} to keep access.
          </Alert>
        )}
        {sub.cancel_at_period_end && (
          <Alert
            tone="warning"
            title="Cancellation scheduled"
            action={
              manage && (
                <Button size="sm" variant="secondary" loading={resume.isPending} onClick={() => resume.mutate(undefined)}>
                  Keep my plan
                </Button>
              )
            }
          >
            Your plan stays active until {formatDate(sub.current_period_end)} and then ends. No further charges are made.
          </Alert>
        )}
        {sub.pending_plan && (
          <Alert
            tone="info"
            title={`Switching to ${sub.pending_plan.name} at period end`}
            action={
              manage && (
                <div className="flex gap-2">
                  <Link to={`/app/billing/checkout/${sub.pending_plan.id}`} className={buttonClasses('primary', 'sm')}>
                    Pay for next period
                  </Link>
                  <Button size="sm" variant="ghost" loading={clearChange.isPending} onClick={() => clearChange.mutate(undefined)}>
                    Undo
                  </Button>
                </div>
              )
            }
          >
            Pay for the new plan before {formatDate(sub.current_period_end)}; it starts when this period ends.
          </Alert>
        )}
        {data.scheduled && (
          <Alert tone="success" title={`${data.scheduled.plan_name} is paid and scheduled`}>
            It starts on {formatDate(data.scheduled.starts_at)}.
          </Alert>
        )}
        {error && <Alert tone="error">{error.message}</Alert>}

        {manage && (
          <div className="flex flex-wrap gap-2 border-t border-border pt-4">
            <Link to="/app/billing/plans" className={buttonClasses('primary', 'md')}>
              Change plan
            </Link>
            {!sub.pending_plan && (
              <Link to={`/app/billing/checkout/${sub.plan.id}`} className={buttonClasses('secondary', 'md')}>
                Renew
              </Link>
            )}
            {sub.status === 'active' && !sub.cancel_at_period_end && (
              <Button variant="ghost" onClick={() => setConfirmCancel(true)}>
                Cancel subscription
              </Button>
            )}
          </div>
        )}
        <ConfirmDialog
          open={confirmCancel}
          onClose={() => setConfirmCancel(false)}
          onConfirm={() => cancel.mutate(undefined, { onSuccess: () => setConfirmCancel(false) })}
          loading={cancel.isPending}
          error={cancel.error?.message}
          title="Cancel your subscription?"
          description={`You keep access until ${formatDate(sub.current_period_end)}. After that, paid features stop. Payments already made are not refunded automatically.`}
          confirmLabel="Cancel subscription"
        />
      </CardBody>
    </Card>
  )
}

// Usage tiles from the reference "Plan Usage" row (icon, used / limit, bar, %).
const USAGE_STYLE: Record<string, { icon: LucideIcon; tile: string; bar: string }> = {
  catalogues: { icon: BookOpen, tile: 'bg-[#e0edff] text-[#1f6fff]', bar: 'bg-brand-700' },
  products: { icon: Package, tile: 'bg-[#dcf7e5] text-[#16a34a]', bar: 'bg-[#22b45a]' },
  staff: { icon: Users, tile: 'bg-[#fff1d6] text-[#f59e0b]', bar: 'bg-[#f59e0b]' },
  storage: { icon: HardDrive, tile: 'bg-[#efe4ff] text-[#7c3aed]', bar: 'bg-[#8b5cf6]' },
}

function UsageCard({ data }: { data: BillingOverview }) {
  return (
    <Card>
      <CardHeader title="Plan Usage" description="Limits come from the plan you purchased." />
      <CardBody>
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {data.usage.map((row) => {
            const pct = row.used !== null && row.limit ? Math.min(100, Math.round((row.used / row.limit) * 100)) : 0
            const style = USAGE_STYLE[row.key] ?? Object.values(USAGE_STYLE)[0]!
            const Icon = style.icon
            return (
              <li key={row.key} className="flex items-start gap-3 rounded-xl p-3 ring-1 ring-[#e6edf7]">
                <span className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${style.tile}`}><Icon className="size-5" aria-hidden /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] text-body capitalize">{row.label}</p>
                  <p className="text-[16px] font-bold text-ink tabular-nums">
                    {row.used === null ? '—' : row.used.toLocaleString()} / {data.subscription ? (row.limit === null ? 'Unlimited' : row.limit.toLocaleString()) : '—'}
                  </p>
                  {row.used !== null && row.limit !== null && (
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#e8eef7]" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${row.label} used`}>
                        <div className={`h-full rounded-full ${pct >= 90 ? 'bg-amber-500' : style.bar}`} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-[11.5px] text-body tabular-nums">{pct}%</span>
                    </div>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      </CardBody>
    </Card>
  )
}

function HistoryCard() {
  const { businessId } = useActiveBusiness()
  const history = useSubscriptionHistory(businessId)
  const rows = history.data?.results.filter((s) => s.status !== 'abandoned') ?? []
  return (
    <Card>
      <CardHeader title="Subscription history" />
      <CardBody className="p-0">
        {history.isPending ? (
          <Spinner />
        ) : history.isError ? (
          <div className="p-5">
            <ErrorState error={history.error} onRetry={() => history.refetch()} />
          </div>
        ) : rows.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted">No subscriptions yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                <CalendarClock className="size-4 text-muted" aria-hidden />
                <span className="flex-1 font-medium">{s.plan_name}</span>
                <span className="text-muted">
                  {formatDate(s.current_period_start ?? s.created_at)} – {formatDate(s.ended_at ?? s.current_period_end)}
                </span>
                <Badge tone={SUBSCRIPTION_STATUS[s.status].tone}>{SUBSCRIPTION_STATUS[s.status].label}</Badge>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  )
}

function PaymentsCard() {
  const { businessId, can } = useActiveBusiness()
  const [page, setPage] = useState(1)
  const payments = usePayments(businessId, page)
  return (
    <Card>
      <CardHeader title="Payment History" action={can('invoice.view') && <Link to="/app/billing/invoices" className={buttonClasses('secondary', 'sm')}>View All Invoices →</Link>} />
      <CardBody className="p-0">
        {payments.isPending ? (
          <Spinner />
        ) : payments.isError ? (
          <div className="p-5">
            <ErrorState error={payments.error} onRetry={() => payments.refetch()} />
          </div>
        ) : payments.data.results.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted">No payments yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-thead text-[13px] font-semibold text-ink">
                <tr>
                  <th scope="col" className="px-5 py-3">Date</th>
                  <th scope="col" className="px-5 py-3">Description</th>
                  <th scope="col" className="px-5 py-3">Amount</th>
                  <th scope="col" className="px-5 py-3">Status</th>
                  <th scope="col" className="px-5 py-3"><span className="sr-only">Details</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {payments.data.results.map((p) => (
                  <tr key={p.id}>
                    <td className="px-5 py-3 whitespace-nowrap">{formatDate(p.paid_at ?? p.created_at)}</td>
                    <td className="px-5 py-3">
                      {p.plan_name} · {PAYMENT_KIND[p.kind]} {p.is_test && <Badge tone="warning">Test</Badge>}
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap">{formatMoney(p.amount, p.currency)}</td>
                    <td className="px-5 py-3">
                      <Badge tone={PAYMENT_STATUS[p.status].tone}>{PAYMENT_STATUS[p.status].label}</Badge>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Link to={`/app/billing/payments/${p.id}`} className="text-sm font-medium text-brand-700 hover:underline">
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {payments.data && (
          <div className="px-5 pb-4">
            <Pagination page={page} totalPages={payments.data.total_pages} count={payments.data.count} pageSize={payments.data.page_size} noun="payments" onPage={setPage} />
          </div>
        )}
      </CardBody>
    </Card>
  )
}

export function BillingPage() {
  const { businessId, can } = useActiveBusiness()
  const overview = useBillingOverview(businessId)
  const plans = usePlans(overview.data?.subscription?.plan_interval ?? 'month')
  const visiblePlans = plans.data ?? []

  return (
    <RequirePermission codes={['subscription.view']}>
      <PageHero
        icon={Crown}
        title="Subscription Plans"
        description="Choose the right plan for your business and unlock powerful features. Manage your current subscription, upgrade or downgrade anytime."
        illustration={heroArt}
        highlights={['Plans for every business size', 'Manage your subscription and billing', 'Upgrade or downgrade anytime', 'Invoices for every payment']}
      />
      {overview.isPending ? (
        <Spinner />
      ) : overview.isError ? (
        <ErrorState error={overview.error} onRetry={() => overview.refetch()} />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-4">
          {visiblePlans.length > 0 && (
            <PlanCards plans={visiblePlans} currentPlanId={overview.data.subscription?.plan.id} canBuy={can('subscription.manage')} compact />
          )}
          {overview.data.payments_test_mode && (
            <Alert tone="warning" title="Test mode">
              Payments use the development mock gateway. No real money is charged.
            </Alert>
          )}
          {overview.data.open_checkout && can('payment.view') && (
            <Alert
              tone="info"
              title="You have an unfinished checkout"
              action={
                <Link to={`/app/billing/payments/${overview.data.open_checkout.id}`} className={buttonClasses('primary', 'sm')}>
                  Continue
                </Link>
              }
            >
              {overview.data.open_checkout.plan_name} · {formatMoney(overview.data.open_checkout.amount, overview.data.open_checkout.currency)}
            </Alert>
          )}
          <CurrentPlanCard data={overview.data} />
          <UsageCard data={overview.data} />
          {can('payment.view') && <PaymentsCard />}
          <HistoryCard />
        </div>
        {visiblePlans.length > 0 && (
          <aside className="space-y-4 xl:sticky xl:top-20 xl:self-start">
            <Card>
              <CardHeader title="Plan Comparison" />
              <CardBody className="px-3"><PlanComparison plans={visiblePlans} /></CardBody>
            </Card>
          </aside>
        )}
        </div>
      )}
    </RequirePermission>
  )
}
