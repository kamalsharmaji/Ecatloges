import { AlertTriangle, Building2, CalendarDays, CalendarX2, CircleX, CreditCard, RefreshCw, UserCheck, Wallet } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useAdminCancelSubscription, useAdminPayments, useAdminReconcile, useAdminSubscriptions, type AdminListParams } from '@/api/billing'
import { PageHero } from '@/components/panel/PageHero'
import { StatCard, StatGrid } from '@/components/panel/StatCard'
import { FilterSelect, SearchInput, Toolbar } from '@/components/panel/Toolbar'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Alert, Badge, EmptyState, ErrorState, Spinner } from '@/components/ui/Feedback'
import { Checkbox } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { Pagination } from '@/components/ui/Pagination'
import { useAuth } from '@/features/auth/AuthContext'
import { formatDate, formatDateTime, formatMoney, PAYMENT_KIND, PAYMENT_STATUS, SUBSCRIPTION_STATUS } from '@/features/billing/format'
import { RequirePlatformPermission } from '@/routes/guards'
import type { AdminPayment, AdminSubscription } from '@/types/billing'

function Filters({ children, search, onSearch }: { children?: ReactNode; search: string; onSearch: (v: string) => void }) {
  return (
    <Toolbar>
      <SearchInput value={search} onChange={onSearch} placeholder="Search business, plan or reference…" />
      {children}
    </Toolbar>
  )
}

function StatusSelect({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: Record<string, { label: string }> }) {
  return (
    <FilterSelect label="Filter by status" value={value} onChange={onChange}
      options={[{ value: '', label: 'All Status' }, ...Object.entries(options).map(([key, { label }]) => ({ value: key, label }))]} />
  )
}

/** Count-only reads (page_size=1) for the stat cards. */
function useSubCount(status?: string) {
  return useAdminSubscriptions({ page: 1, status, page_size: 1 } as AdminListParams).data?.count
}

function SubscriptionStats() {
  const total = useSubCount()
  const active = useSubCount('active')
  const pastDue = useSubCount('past_due')
  const expired = useSubCount('expired')
  const cancelled = useSubCount('cancelled')
  const pct = (n?: number) => (total && n !== undefined ? `${Math.round((n / total) * 100)}% of total` : undefined)
  return (
    <StatGrid cols={5}>
      <StatCard icon={Building2} label="Total Subscriptions" value={total ?? '—'} loading={total === undefined} hint="Including history" />
      <StatCard icon={UserCheck} tone="green" label="Active" value={active ?? '—'} loading={active === undefined} hint={pct(active)} />
      <StatCard icon={AlertTriangle} tone="amber" label="Past Due" value={pastDue ?? '—'} loading={pastDue === undefined} hint={pct(pastDue)} />
      <StatCard icon={CalendarX2} tone="red" label="Expired" value={expired ?? '—'} loading={expired === undefined} hint={pct(expired)} />
      <StatCard icon={CircleX} tone="slate" label="Cancelled" value={cancelled ?? '—'} loading={cancelled === undefined} hint={pct(cancelled)} />
    </StatGrid>
  )
}

// --- Subscriptions -------------------------------------------------------------------------
function CancelModal({ sub, onClose }: { sub: AdminSubscription | null; onClose: () => void }) {
  const cancel = useAdminCancelSubscription()
  const [immediately, setImmediately] = useState(false)
  if (!sub) return null
  return (
    <Modal
      open
      onClose={onClose}
      title={`Cancel ${sub.business.name}'s subscription?`}
      description="This is recorded in the application log. No refund is issued automatically."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Keep
          </Button>
          <Button variant="danger" loading={cancel.isPending} onClick={() => cancel.mutate({ id: sub.id, immediately }, { onSuccess: onClose })}>
            Cancel subscription
          </Button>
        </>
      }
    >
      <Checkbox
        label="End access immediately (otherwise at the end of the current period)"
        checked={immediately}
        onChange={(e) => setImmediately(e.target.checked)}
      />
      {cancel.isError && <p className="mt-3 text-sm text-red-600">{cancel.error.message}</p>}
    </Modal>
  )
}

export function AdminSubscriptionsPage() {
  const { user } = useAuth()
  const [params, setParams] = useState<AdminListParams>({ page: 1, search: '', status: '' })
  const subs = useAdminSubscriptions({ ...params, search: params.search || undefined, status: params.status || undefined })
  const [cancelling, setCancelling] = useState<AdminSubscription | null>(null)
  const canManage = Boolean(user?.platform_permissions.includes('platform.subscription.manage'))

  return (
    <RequirePlatformPermission code="platform.subscription.view">
      <PageHero icon={CalendarDays} title="Subscriptions Management" description="Manage all subscription plans, renewals and billing across the platform." />
      <SubscriptionStats />
      <Filters search={params.search ?? ''} onSearch={(search) => setParams({ ...params, search, page: 1 })}>
        <StatusSelect value={params.status ?? ''} onChange={(status) => setParams({ ...params, status, page: 1 })} options={SUBSCRIPTION_STATUS} />
      </Filters>
      {subs.isPending ? (
        <Spinner />
      ) : subs.isError ? (
        <ErrorState error={subs.error} onRetry={() => subs.refetch()} />
      ) : subs.data.results.length === 0 ? (
        <EmptyState icon={CreditCard} title="No subscriptions found" />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-thead text-[13px] font-semibold text-ink">
                <tr>
                  <th scope="col" className="px-5 py-3">Business</th>
                  <th scope="col" className="px-5 py-3">Plan</th>
                  <th scope="col" className="px-5 py-3">Status</th>
                  <th scope="col" className="px-5 py-3">Period end</th>
                  <th scope="col" className="px-5 py-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {subs.data.results.map((s) => (
                  <tr key={s.id}>
                    <td className="px-5 py-3 font-medium">{s.business.name}</td>
                    <td className="px-5 py-3">
                      {s.plan_name}
                      <span className="block text-xs text-muted">{formatMoney(s.plan_price, s.plan_currency)} / {s.plan_interval}</span>
                    </td>
                    <td className="px-5 py-3">
                      <Badge tone={SUBSCRIPTION_STATUS[s.status].tone}>{SUBSCRIPTION_STATUS[s.status].label}</Badge>
                      {s.cancel_at_period_end && <span className="block text-xs text-amber-700">Cancels at period end</span>}
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap">{formatDate(s.current_period_end)}</td>
                    <td className="px-5 py-3 text-right">
                      {canManage && ['active', 'past_due', 'scheduled'].includes(s.status) && (
                        <Button variant="ghost" size="sm" onClick={() => setCancelling(s)}>
                          Cancel
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-5 pb-4">
            <Pagination page={params.page ?? 1} totalPages={subs.data.total_pages} count={subs.data.count} pageSize={subs.data.page_size} noun="subscriptions" onPage={(page) => setParams({ ...params, page })} />
          </div>
        </Card>
      )}
      <CancelModal sub={cancelling} onClose={() => setCancelling(null)} />
    </RequirePlatformPermission>
  )
}

// --- Payments ------------------------------------------------------------------------------
function PaymentDetail({ payment, onClose }: { payment: AdminPayment | null; onClose: () => void }) {
  const { user } = useAuth()
  const reconcile = useAdminReconcile()
  if (!payment) return null
  const canReconcile = user?.platform_permissions.includes('platform.payment.reconcile')
  const current = reconcile.data?.id === payment.id ? reconcile.data : payment
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={`${formatMoney(current.amount, current.currency)} · ${current.business.name}`}
      description={`${PAYMENT_KIND[current.kind]} · ${current.plan_name}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          {canReconcile && (
            <Button icon={<RefreshCw className="size-4" />} loading={reconcile.isPending} onClick={() => reconcile.mutate(current.id)}>
              Reconcile with provider
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4 text-sm">
        {current.requires_attention && (
          <Alert tone="error" title="Needs attention">
            {current.attention_reason}
          </Alert>
        )}
        {reconcile.isError && <Alert tone="error">{reconcile.error.message}</Alert>}
        <dl className="grid gap-3 sm:grid-cols-2">
          {[
            ['Status', PAYMENT_STATUS[current.status].label],
            ['Provider', `${current.provider}${current.is_test ? ' (test)' : ''}`],
            ['Order reference', current.provider_order_id],
            ['Provider payment id', current.provider_payment_id || '—'],
            ['Created', formatDateTime(current.created_at)],
            ['Paid', formatDateTime(current.paid_at)],
            ['Applied to subscription', formatDateTime(current.applied_at)],
            ['Last reconciled', formatDateTime(current.last_reconciled_at)],
            ['Failure', current.failure_code ? `${current.failure_code} ${current.failure_message}` : '—'],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-muted">{label}</dt>
              <dd className="font-medium break-all">{value}</dd>
            </div>
          ))}
        </dl>
        <div>
          <p className="mb-2 font-semibold">Provider events</p>
          {current.events.length === 0 ? (
            <p className="text-muted">No events received.</p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {current.events.map((e) => (
                <li key={e.id} className="flex flex-wrap gap-2 px-3 py-2">
                  <span className="font-mono text-xs">{e.event_type}</span>
                  <Badge tone={e.outcome === 'processed' ? 'success' : 'neutral'}>{e.outcome}</Badge>
                  <span className="flex-1 text-xs text-muted">{e.detail}</span>
                  <span className="text-xs text-muted">{formatDateTime(e.received_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  )
}

export function AdminPaymentsPage() {
  const [params, setParams] = useState<AdminListParams>({ page: 1, search: '', status: '', requires_attention: '' })
  const payments = useAdminPayments({
    page: params.page,
    search: params.search || undefined,
    status: params.status || undefined,
    requires_attention: params.requires_attention || undefined,
  })
  const [selected, setSelected] = useState<AdminPayment | null>(null)

  return (
    <RequirePlatformPermission code="platform.payment.view">
      <PageHero icon={CreditCard} title="Payments" description="Gateway orders, verification outcomes and payments needing review." />
      <Filters search={params.search ?? ''} onSearch={(search) => setParams({ ...params, search, page: 1 })}>
        <StatusSelect value={params.status ?? ''} onChange={(status) => setParams({ ...params, status, page: 1 })} options={PAYMENT_STATUS} />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4 accent-brand-700"
            checked={params.requires_attention === 'true'}
            onChange={(e) => setParams({ ...params, requires_attention: e.target.checked ? 'true' : '', page: 1 })}
          />
          Needs attention only
        </label>
      </Filters>
      {payments.isPending ? (
        <Spinner />
      ) : payments.isError ? (
        <ErrorState error={payments.error} onRetry={() => payments.refetch()} />
      ) : payments.data.results.length === 0 ? (
        <EmptyState icon={Wallet} title="No payments found" />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-thead text-[13px] font-semibold text-ink">
                <tr>
                  <th scope="col" className="px-5 py-3">Date</th>
                  <th scope="col" className="px-5 py-3">Business</th>
                  <th scope="col" className="px-5 py-3">Amount</th>
                  <th scope="col" className="px-5 py-3">Status</th>
                  <th scope="col" className="px-5 py-3"><span className="sr-only">Details</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {payments.data.results.map((p) => (
                  <tr key={p.id}>
                    <td className="px-5 py-3 whitespace-nowrap">{formatDateTime(p.created_at)}</td>
                    <td className="px-5 py-3">
                      {p.business.name}
                      <span className="block text-xs text-muted">
                        {PAYMENT_KIND[p.kind]} · {p.plan_name}
                      </span>
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap">
                      {formatMoney(p.amount, p.currency)} {p.is_test && <Badge tone="warning">Test</Badge>}
                    </td>
                    <td className="px-5 py-3">
                      <Badge tone={PAYMENT_STATUS[p.status].tone}>{PAYMENT_STATUS[p.status].label}</Badge>
                      {p.requires_attention && (
                        <span className="mt-1 flex items-center gap-1 text-xs font-medium text-red-700">
                          <AlertTriangle className="size-3.5" aria-hidden /> Needs attention
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Button variant="ghost" size="sm" onClick={() => setSelected(p)}>
                        Details
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-5 pb-4">
            <Pagination page={params.page ?? 1} totalPages={payments.data.total_pages} count={payments.data.count} pageSize={payments.data.page_size} noun="payments" onPage={(page) => setParams({ ...params, page })} />
          </div>
        </Card>
      )}
      <PaymentDetail payment={selected} onClose={() => setSelected(null)} />
    </RequirePlatformPermission>
  )
}
