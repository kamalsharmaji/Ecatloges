import { Ban, Building2, CircleCheck, Clock, ExternalLink, PauseCircle, Plus, RotateCcw, X } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAdminBusiness, useAdminBusinesses, useAdminBusinessSummary, useBusinessStatusAction } from '@/api/platform'
import { PageHero } from '@/components/panel/PageHero'
import { StatCard } from '@/components/panel/StatCard'
import { FilterSelect, SearchInput, Toolbar } from '@/components/panel/Toolbar'
import { Button } from '@/components/ui/Button'
import { EmptyState, ErrorState, Spinner } from '@/components/ui/Feedback'
import { Pagination } from '@/components/ui/Pagination'
import { useToast } from '@/components/ui/toast'
import { useAuth } from '@/features/auth/AuthContext'
import { categoryLabel } from '@/features/business/constants'
import { formatBytes, formatPrice } from '@/features/content/format'
import { formatDateTime } from '@/features/leads/leadFormat'
import { ReasonDialog } from '@/features/platform/ReasonDialog'
import { actionLabel, relativeTime } from '@/features/workspace/format'
import { RequirePlatformPermission } from '@/routes/guards'
import type { AdminBusiness } from '@/types/platform'
import { cn } from '@/utils/cn'

const SUB_LABEL: Record<string, { label: string; className: string }> = {
  active: { label: 'Active', className: 'bg-emerald-50 text-emerald-700' },
  past_due: { label: 'Past due', className: 'bg-amber-50 text-amber-800' },
}

function subscriptionPill(b: Pick<AdminBusiness, 'subscription_status' | 'subscription_ends_at'>) {
  if (!b.subscription_status) return { label: 'No plan', className: 'bg-slate-100 text-slate-600' }
  const soon = b.subscription_ends_at && new Date(b.subscription_ends_at).getTime() - Date.now() < 7 * 86_400_000
  if (b.subscription_status === 'active' && soon) return { label: 'Expiring soon', className: 'bg-orange-50 text-orange-700' }
  return SUB_LABEL[b.subscription_status] ?? { label: b.subscription_status, className: 'bg-slate-100 text-slate-600' }
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold tracking-wide text-muted uppercase">{title}</p>
      {children}
    </div>
  )
}

function BusinessPanel({ id, onClose }: { id: string; onClose: () => void }) {
  const { user } = useAuth()
  const toast = useToast()
  const business = useAdminBusiness(id)
  const statusAction = useBusinessStatusAction()
  const [dialog, setDialog] = useState<'suspend' | 'reactivate' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const canManage = Boolean(user?.platform_permissions.includes('platform.business.manage'))
  const b = business.data

  return (
    <aside className="rounded-2xl bg-white p-5 shadow-panel" aria-label="Business details">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-[17px] font-bold text-ink">Business Details</h2>
        <button type="button" onClick={onClose} aria-label="Close details" className="rounded p-1 text-muted hover:bg-canvas"><X className="size-5" /></button>
      </div>
      {business.isPending ? <Spinner /> : business.isError ? <ErrorState error={business.error} onRetry={() => business.refetch()} /> : b && (
        <div className="space-y-5 text-sm">
          <div>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-base font-bold">{b.name}</p>
                <p className="text-muted">{categoryLabel(b.category)} · {[b.city, b.state, b.country].filter(Boolean).join(', ')}</p>
              </div>
              <span className={cn('shrink-0 rounded-md px-2 py-0.5 text-xs font-semibold capitalize', b.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700')}>{b.status}</span>
            </div>
            <p className="mt-1 text-xs text-muted">/{b.slug} · joined {formatDateTime(b.created_at)}</p>
            <p className="mt-1 text-xs text-muted">{b.email} · {b.phone}</p>
          </div>
          <dl className="grid grid-cols-2 gap-2">
            {[['Catalogues', b.catalogue_count], ['Products', b.product_count], ['Enquiries', b.enquiry_count], ['Storage', formatBytes(b.storage_bytes)]].map(([k, v]) => (
              <div key={k as string} className="rounded-lg bg-canvas px-3 py-2"><dt className="text-xs text-muted">{k}</dt><dd className="font-semibold tabular-nums">{v}</dd></div>
            ))}
          </dl>
          <Section title={`Team (${b.members.length})`}>
            <ul className="divide-y divide-border rounded-lg border border-border">
              {b.members.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-2 px-3 py-2">
                  <span className="min-w-0"><Link to={`/admin/users?user=${m.user_id}`} className="block truncate font-medium hover:text-brand-700">{m.name}</Link><span className="block truncate text-xs text-muted">{m.email}</span></span>
                  <span className="shrink-0 text-xs text-muted">{m.role}{m.status !== 'active' && ` · ${m.status}`}</span>
                </li>
              ))}
            </ul>
          </Section>
          <Section title="Subscription history">
            {b.subscriptions.length === 0 ? <p className="text-muted">Never subscribed.</p> : (
              <ul className="space-y-1">
                {b.subscriptions.map((s) => (
                  <li key={s.id} className="flex justify-between gap-2"><span>{s.plan_name}</span><span className="text-xs text-muted">{s.status.replace('_', ' ')}{s.current_period_end && ` · until ${formatDateTime(s.current_period_end)}`}</span></li>
                ))}
              </ul>
            )}
            <Link to="/admin/subscriptions" className="mt-1 inline-block text-xs font-medium text-brand-700 hover:underline">Open subscriptions →</Link>
          </Section>
          <Section title="Recent payments">
            {b.payments.length === 0 ? <p className="text-muted">No payments.</p> : (
              <ul className="space-y-1">
                {b.payments.map((p) => (
                  <li key={p.id} className="flex justify-between gap-2">
                    <span className="tabular-nums">{formatPrice(p.amount, p.currency)}{p.is_test && <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] font-semibold text-amber-800">TEST</span>}</span>
                    <span className="text-xs text-muted">{p.status} · {formatDateTime(p.paid_at ?? p.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
          <Section title="Catalogues">
            {b.catalogues.length === 0 ? <p className="text-muted">No catalogues.</p> : (
              <ul className="space-y-1">
                {b.catalogues.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2">
                    <span className="truncate">{c.name}</span>
                    {c.public_url ? <a href={c.public_url} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 text-xs text-brand-700 hover:underline">Live <ExternalLink className="size-3" aria-hidden /></a> : <span className="text-xs text-muted">{c.status}</span>}
                  </li>
                ))}
              </ul>
            )}
          </Section>
          <Section title="Recent activity">
            {b.activity.length === 0 ? <p className="text-muted">No recorded activity.</p> : (
              <ul className="space-y-1.5">
                {b.activity.slice(0, 8).map((e) => (
                  <li key={e.id} className="flex justify-between gap-2"><span className="truncate">{actionLabel(e.action)} <span className="text-muted">{e.target_label}</span></span><span className="shrink-0 text-xs text-muted">{relativeTime(e.created_at)}</span></li>
                ))}
              </ul>
            )}
          </Section>
          {canManage && (
            <div className="border-t border-border pt-4">
              {b.status === 'active' ? (
                <Button variant="danger" className="w-full" icon={<Ban className="size-4" />} onClick={() => { setError(null); setDialog('suspend') }}>Suspend business</Button>
              ) : (
                <Button className="w-full" icon={<RotateCcw className="size-4" />} onClick={() => { setError(null); setDialog('reactivate') }}>Reactivate business</Button>
              )}
              <p className="mt-2 text-xs text-muted">Suspension blocks the team's access and takes public catalogues offline. Nothing is deleted; subscriptions and payments are unchanged.</p>
            </div>
          )}
        </div>
      )}
      {dialog && b && (
        <ReasonDialog
          title={dialog === 'suspend' ? `Suspend ${b.name}?` : `Reactivate ${b.name}?`}
          description={dialog === 'suspend'
            ? `${b.members.length} team member(s) lose access and ${b.catalogues.filter((c) => c.public_url).length} live catalogue(s) go offline until you reactivate. Owners are notified with your reason.`
            : 'The team regains access and published catalogues come back online.'}
          confirmLabel={dialog === 'suspend' ? 'Suspend' : 'Reactivate'}
          tone={dialog === 'suspend' ? 'danger' : 'primary'}
          loading={statusAction.isPending}
          error={error}
          onClose={() => setDialog(null)}
          onConfirm={(reason) => statusAction.mutate({ id, action: dialog, reason }, {
            onSuccess: () => { toast.show(dialog === 'suspend' ? 'Business suspended.' : 'Business reactivated.'); setDialog(null) },
            onError: (e) => setError(e.message),
          })}
        />
      )}
    </aside>
  )
}

const TABS = [
  { key: '', label: 'All Businesses', params: {} },
  { key: 'active-plan', label: 'Active Plan', params: { subscription: 'active', status: 'active' } },
  { key: 'expiring', label: 'Expiring Soon', params: { subscription: 'expiring' } },
  { key: 'none', label: 'No Plan', params: { subscription: 'none' } },
  { key: 'suspended', label: 'Suspended', params: { status: 'suspended' } },
] as const

export function AdminBusinessesPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const openId = searchParams.get('business')
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('')
  const [params, setParams] = useState({ page: 1, search: '', plan: '', ordering: '-created_at' })
  const tabParams = TABS.find((t) => t.key === tab)!.params
  const list = useAdminBusinesses({ ...params, ...tabParams, page_size: 10 })
  const summary = useAdminBusinessSummary()
  const s = summary.data
  const set = (patch: Partial<typeof params>) => setParams((p) => ({ ...p, page: 1, ...patch }))
  const rows = list.data?.results ?? []
  const pct = (n: number) => (s?.total ? `${Math.round((n / s.total) * 100)}% of total` : undefined)

  return (
    <RequirePlatformPermission code="platform.business.view">
      <PageHero icon={Building2} title="Businesses" description="All registered businesses on the platform, their plans, usage and status." />
      <div className="mb-4 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 2xl:grid-cols-6">
        <StatCard icon={Building2} label="Total Businesses" value={s?.total ?? '—'} loading={summary.isPending} />
        <StatCard icon={CircleCheck} tone="green" label="With Active Plan" value={s?.with_plan ?? '—'} loading={summary.isPending} hint={s && pct(s.with_plan)} />
        <StatCard icon={Clock} tone="amber" label="Expiring Soon" value={s?.expiring ?? '—'} loading={summary.isPending} hint="Next 7 days" />
        <StatCard icon={X} tone="slate" label="No Current Plan" value={s?.without_plan ?? '—'} loading={summary.isPending} hint={s && pct(s.without_plan)} />
        <StatCard icon={PauseCircle} tone="violet" label="Suspended" value={s?.suspended ?? '—'} loading={summary.isPending} hint={s && pct(s.suspended)} />
        <StatCard icon={Plus} tone="pink" label="New This Month" value={s?.new_this_month ?? '—'} loading={summary.isPending} />
      </div>

      <div className={openId ? 'grid gap-6 2xl:grid-cols-[minmax(0,1fr)_26rem]' : ''}>
        <div className="min-w-0">
          <div className="mb-3 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Business filter">
            {TABS.map((t) => (
              <button key={t.key || 'all'} type="button" role="tab" aria-selected={tab === t.key} onClick={() => { setTab(t.key); setParams((p) => ({ ...p, page: 1 })) }}
                className={cn('h-10 shrink-0 rounded-lg px-4 text-sm font-medium', tab === t.key ? 'bg-brand-700 text-white shadow-pill' : 'bg-white text-ink ring-1 ring-[#d5e5fa] hover:bg-brand-50')}>
                {t.label}
              </button>
            ))}
          </div>
          <Toolbar>
            <SearchInput value={params.search} onChange={(search) => set({ search })} placeholder="Search name, owner, email, phone, city…" />
            <FilterSelect label="Plan" value={params.plan} onChange={(plan) => set({ plan })}
              options={[{ value: '', label: 'All plans' }, ...(s?.plans ?? []).map((p) => ({ value: p, label: p }))]} />
            <FilterSelect label="Sort" value={params.ordering} onChange={(ordering) => set({ ordering })}
              options={[
                { value: '-created_at', label: 'Newest first' }, { value: 'name', label: 'Name A–Z' },
                { value: '-product_count', label: 'Most products' }, { value: '-storage_bytes', label: 'Most storage' },
                { value: 'subscription_ends_at', label: 'Plan ends soonest' },
              ]} />
          </Toolbar>
          {list.isPending ? <Spinner /> : list.isError ? <ErrorState error={list.error} onRetry={() => list.refetch()} /> : rows.length === 0 ? (
            <EmptyState icon={Building2} title={params.search || tab ? 'No businesses match your filters' : 'No businesses yet'} description="Businesses appear here as soon as someone registers." />
          ) : (
            <div className="overflow-x-auto rounded-2xl bg-white shadow-panel">
              <table className="w-full text-left text-sm">
                <thead className="bg-thead text-[13px] font-semibold text-ink">
                  <tr>
                    <th scope="col" className="px-4 py-3">Business</th>
                    <th scope="col" className="hidden px-3 py-3 md:table-cell">Owner</th>
                    <th scope="col" className="px-3 py-3">Plan</th>
                    <th scope="col" className="px-3 py-3">Status</th>
                    <th scope="col" className="hidden px-3 py-3 lg:table-cell">Joined</th>
                    <th scope="col" className="hidden px-3 py-3 xl:table-cell">Plan ends</th>
                    <th scope="col" className="hidden px-3 py-3 text-right sm:table-cell">Users</th>
                    <th scope="col" className="hidden px-3 py-3 text-right sm:table-cell">Products</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((b) => {
                    const pill = subscriptionPill(b)
                    return (
                      <tr key={b.id} onClick={() => setSearchParams({ business: b.id })} className={cn('cursor-pointer hover:bg-canvas', openId === b.id && 'bg-brand-50/60')}>
                        <td className="px-4 py-3">
                          <button type="button" onClick={() => setSearchParams({ business: b.id })} className="block max-w-56 truncate text-left font-medium text-brand-800 hover:underline">{b.name}</button>
                          <span className="text-xs text-muted">{categoryLabel(b.category)} · {b.city}</span>
                        </td>
                        <td className="hidden px-3 py-3 md:table-cell"><span className="block max-w-44 truncate">{b.owner_name}</span><span className="block max-w-44 truncate text-xs text-muted">{b.phone}</span></td>
                        <td className="px-3 py-3"><span className="text-xs font-medium">{b.plan_name ?? '—'}</span><span className={cn('mt-0.5 block w-fit rounded-md px-1.5 py-0.5 text-[11px] font-semibold', pill.className)}>{pill.label}</span></td>
                        <td className="px-3 py-3"><span className={cn('rounded-md px-2 py-0.5 text-xs font-semibold capitalize', b.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700')}>{b.status}</span></td>
                        <td className="hidden px-3 py-3 text-xs whitespace-nowrap text-muted lg:table-cell">{formatDateTime(b.created_at)}</td>
                        <td className="hidden px-3 py-3 text-xs whitespace-nowrap text-muted xl:table-cell">{formatDateTime(b.subscription_ends_at)}</td>
                        <td className="hidden px-3 py-3 text-right tabular-nums sm:table-cell">{b.member_count}</td>
                        <td className="hidden px-3 py-3 text-right tabular-nums sm:table-cell">{b.product_count}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          {list.data && list.data.count > 0 && (
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
              <span>Showing {(list.data.page - 1) * list.data.page_size + 1} to {Math.min(list.data.page * list.data.page_size, list.data.count)} of {list.data.count} businesses</span>
              <Pagination page={params.page} totalPages={list.data.total_pages} count={list.data.count} onPage={(page) => setParams((p) => ({ ...p, page }))} />
            </div>
          )}
        </div>
        {openId && <div className="2xl:sticky 2xl:top-20 2xl:self-start"><BusinessPanel id={openId} onClose={() => setSearchParams({})} /></div>}
      </div>
    </RequirePlatformPermission>
  )
}
