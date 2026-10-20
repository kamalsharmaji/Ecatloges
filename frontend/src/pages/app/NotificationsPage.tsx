import { Bell, BookOpen, CheckCheck, CreditCard, Crown, ExternalLink, Mail, MailOpen, Trash2, Users, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useEnquiry } from '@/api/leads'
import { useActivity, useMarkAllRead, useNotification, useNotificationAction, useNotifications, useNotificationSummary } from '@/api/workspace'
import { ActionMenu } from '@/components/panel/ActionMenu'
import { PageHero } from '@/components/panel/PageHero'
import { StatCard } from '@/components/panel/StatCard'
import { FilterSelect, SearchInput, Toolbar } from '@/components/panel/Toolbar'
import { Button } from '@/components/ui/Button'
import { buttonClasses } from '@/components/ui/buttonStyles'
import { EmptyState, ErrorState, Spinner } from '@/components/ui/Feedback'
import { Pagination } from '@/components/ui/Pagination'
import { useToast } from '@/components/ui/toast'
import { useActiveBusiness } from '@/features/business/BusinessContext'
import { localISO } from '@/features/leads/dateRange'
import { EnquiryStatusPill } from '@/features/leads/LeadBits'
import { formatDateTime } from '@/features/leads/leadFormat'
import { NotificationIcon } from '@/features/workspace/Bits'
import { actionLabel, LEVEL_STYLE, NOTIFICATION_CATEGORIES, relativeTime } from '@/features/workspace/format'
import type { AppNotification, NotificationCategory } from '@/types/workspace'
import { cn } from '@/utils/cn'

const PERIODS = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
  { value: '', label: 'All time' },
]

const STATS: { key: NotificationCategory; label: string; icon: typeof Mail; tone: 'blue' | 'amber' | 'violet' | 'pink' | 'green' }[] = [
  { key: 'enquiry', label: 'New Enquiries', icon: Mail, tone: 'blue' },
  { key: 'catalogue', label: 'Catalogue Updates', icon: BookOpen, tone: 'amber' },
  { key: 'payment', label: 'Payments', icon: CreditCard, tone: 'violet' },
  { key: 'subscription', label: 'Subscription', icon: Crown, tone: 'pink' },
  { key: 'team', label: 'Team Activity', icon: Users, tone: 'green' },
]

function since(days: string): string {
  if (!days) return ''
  const d = new Date()
  d.setDate(d.getDate() - Number(days) + 1)
  return localISO(d)
}

function EnquiryPreview({ id }: { id: string }) {
  const { businessId } = useActiveBusiness()
  const enquiry = useEnquiry(businessId, id)
  if (enquiry.isPending) return <Spinner />
  if (enquiry.isError) return <p className="text-sm text-muted">This enquiry is no longer available.</p>
  const e = enquiry.data
  return (
    <div className="rounded-lg border border-border">
      <p className="border-b border-border bg-canvas px-3 py-2 text-sm font-semibold">Enquiry Details</p>
      <dl className="grid grid-cols-[6rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 p-3 text-sm">
        <dt className="text-muted">Name</dt><dd className="truncate">{e.name}</dd>
        {e.email && <><dt className="text-muted">Email</dt><dd className="truncate">{e.email}</dd></>}
        <dt className="text-muted">Mobile</dt><dd>{e.phone}</dd>
        {e.product_name && <><dt className="text-muted">Product</dt><dd className="truncate">{e.product_name}</dd></>}
        <dt className="text-muted">Status</dt><dd><EnquiryStatusPill status={e.status} /></dd>
        <dt className="text-muted">Message</dt><dd className="line-clamp-4 whitespace-pre-line">{e.message}</dd>
      </dl>
      <div className="grid grid-cols-2 gap-2 border-t border-border p-3">
        <Link to={`/app/enquiries?enquiry=${e.id}`} className={buttonClasses('primary', 'sm')}>Reply to Enquiry</Link>
        {e.customer
          ? <Link to={`/app/customers?customer=${e.customer.id}`} className={buttonClasses('secondary', 'sm')}>View Customer</Link>
          : e.product && <Link to={`/app/products/${e.product.id}`} className={buttonClasses('secondary', 'sm')}>View Product</Link>}
      </div>
    </div>
  )
}

function TargetActivity({ type, id }: { type: string; id: string }) {
  const { businessId } = useActiveBusiness()
  const activity = useActivity(businessId, { target_type: type, target_id: id, page_size: 5 })
  const rows = activity.data?.results ?? []
  if (activity.isPending || rows.length === 0) return null
  return (
    <div>
      <p className="mb-2 font-semibold">Activity Log</p>
      <ol className="space-y-3 border-l-2 border-border pl-4">
        {rows.map((a) => (
          <li key={a.id} className="relative text-sm">
            <span className="absolute top-1.5 -left-[1.4rem] size-2.5 rounded-full bg-brand-600 ring-2 ring-white" aria-hidden />
            <p className="font-medium">{actionLabel(a.action)}</p>
            <p className="text-xs text-muted">{a.actor_name || 'Visitor'} · {relativeTime(a.created_at)}</p>
          </li>
        ))}
      </ol>
    </div>
  )
}

function NotificationPanel({ id, onClose }: { id: string; onClose: () => void }) {
  const { can } = useActiveBusiness()
  const toast = useToast()
  const note = useNotification(id)
  const action = useNotificationAction()
  const n = note.data
  // Opening a notification marks it as read, like an email.
  useEffect(() => {
    if (n && !n.is_read) action.mutate({ id: n.id, action: 'read' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n?.id])

  return (
    <aside className="rounded-2xl bg-white p-5 shadow-panel" aria-label="Notification details">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-[17px] font-bold text-ink">Notification Details</h2>
        <button type="button" onClick={onClose} aria-label="Close details" className="rounded p-1 text-muted hover:bg-canvas"><X className="size-5" /></button>
      </div>
      {note.isPending ? <Spinner /> : note.isError ? <ErrorState error={note.error} onRetry={() => note.refetch()} /> : n && (
        <div className="space-y-5">
          <div className="flex gap-3">
            <NotificationIcon category={n.category} className="size-12" />
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 font-semibold">
                {n.title}
                <span className={cn('rounded-md px-2 py-0.5 text-xs font-semibold', LEVEL_STYLE[n.level].className)}>{LEVEL_STYLE[n.level].label}</span>
              </p>
              <p className="text-xs text-muted">{relativeTime(n.created_at)} · {formatDateTime(n.created_at)}</p>
            </div>
          </div>
          {n.body && <p className="text-sm text-slate-700">{n.body}</p>}
          {n.target_type === 'enquiry' && can('enquiry.view') && <EnquiryPreview id={n.target_id} />}
          {n.link && n.target_type !== 'enquiry' && (
            <Link to={n.link} className={buttonClasses('primary', 'md', 'w-full')}><ExternalLink className="size-4" aria-hidden /> Open</Link>
          )}
          {can('audit_log.view') && n.target_type && n.target_id && <TargetActivity type={n.target_type} id={n.target_id} />}
          <div className="flex gap-2 border-t border-border pt-4">
            <Button variant="secondary" className="flex-1" loading={action.isPending}
              icon={n.is_read ? <Mail className="size-4" /> : <MailOpen className="size-4" />}
              onClick={() => action.mutate({ id: n.id, action: n.is_read ? 'unread' : 'read' })}>
              {n.is_read ? 'Mark as unread' : 'Mark as read'}
            </Button>
            <Button variant="ghost" aria-label="Delete notification" className="text-red-600"
              onClick={() => action.mutate({ id: n.id, action: 'delete' }, { onSuccess: () => { toast.show('Notification deleted.'); onClose() } })}>
              <Trash2 className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </aside>
  )
}

export function NotificationsPage() {
  const { businessId } = useActiveBusiness()
  const toast = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const openId = searchParams.get('notification')
  const [params, setParams] = useState({ page: 1, search: '', category: '', status: '', period: '30' })
  const query = useMemo(() => ({
    page: params.page, page_size: 10, search: params.search, category: params.category, status: params.status,
    created_from: since(params.period),
  }), [params])
  const list = useNotifications(businessId, query)
  const summary = useNotificationSummary(businessId)
  const markAll = useMarkAllRead(businessId)
  const action = useNotificationAction()
  const set = (patch: Partial<typeof params>) => setParams((p) => ({ ...p, page: 1, ...patch }))
  const counts: Partial<Record<NotificationCategory, { total: number; unread: number; today: number }>> =
    Object.fromEntries((summary.data?.categories ?? []).map((c) => [c.category, c]))
  const tabs = NOTIFICATION_CATEGORIES.filter((c) => ['enquiry', 'catalogue', 'payment', 'subscription', 'team', 'support'].includes(c.key) || counts[c.key]?.total)
  const rows = list.data?.results ?? []
  const filtered = Boolean(params.search || params.status || params.category)

  const menu = (n: AppNotification) => [
    { label: n.is_read ? 'Mark as unread' : 'Mark as read', icon: n.is_read ? Mail : MailOpen, onSelect: () => action.mutate({ id: n.id, action: n.is_read ? 'unread' : 'read' }) },
    { label: 'Delete', icon: Trash2, danger: true, onSelect: () => action.mutate({ id: n.id, action: 'delete' }, { onSuccess: () => { toast.show('Notification deleted.'); if (openId === n.id) setSearchParams({}) } }) },
  ]

  return (
    <>
      <PageHero compact icon={Bell} title="Notifications & Activity Log" description="Stay updated with all important activities, enquiries, payments and system notifications."
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" icon={<CheckCheck className="size-4" />} disabled={!summary.data?.unread} loading={markAll.isPending}
              onClick={() => markAll.mutate(params.category ? (params.category as NotificationCategory) : undefined, { onSuccess: (r) => toast.show(`${r.updated} marked as read.`) })}>
              Mark all as read
            </Button>
            <Link to="/app/activity" className={buttonClasses('secondary', 'md')}>Activity Log</Link>
            <Link to="/app/settings?tab=notifications" className={buttonClasses('secondary', 'md')}>Notification Settings</Link>
          </div>
        } />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-5">
        {STATS.map(({ key, label, icon, tone }) => {
          const c = counts[key]
          return <StatCard key={key} icon={icon} tone={tone} label={label} value={c ? c.unread : '—'} loading={summary.isPending} hint={c && `unread · +${c.today} today`} />
        })}
      </div>

      <div className={openId ? 'grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]' : ''}>
        <div className="min-w-0">
          <div className="mb-3 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Notification type">
            {[{ key: '', label: 'All Notifications' }, ...tabs].map((t) => {
              const count = t.key ? counts[t.key as NotificationCategory]?.total ?? 0 : summary.data?.total ?? 0
              const active = params.category === t.key
              return (
                <button key={t.key || 'all'} type="button" role="tab" aria-selected={active} onClick={() => set({ category: t.key })}
                  className={cn('h-10 shrink-0 rounded-lg px-4 text-sm font-medium', active ? 'bg-brand-700 text-white shadow-pill' : 'bg-white text-ink ring-1 ring-[#d5e5fa] hover:bg-brand-50')}>
                  {t.label} ({count})
                </button>
              )
            })}
          </div>
          <Toolbar>
            <SearchInput value={params.search} onChange={(search) => set({ search })} placeholder="Search notifications…" />
            <FilterSelect label="Status" value={params.status} onChange={(status) => set({ status })}
              options={[{ value: '', label: 'All status' }, { value: 'unread', label: 'Unread' }, { value: 'read', label: 'Read' }]} />
            <FilterSelect label="Period" value={params.period} onChange={(period) => set({ period })} options={PERIODS} />
          </Toolbar>

          {list.isPending ? (
            <Spinner label="Loading notifications…" />
          ) : list.isError ? (
            <ErrorState error={list.error} onRetry={() => list.refetch()} />
          ) : rows.length === 0 ? (
            <EmptyState icon={Bell} title={filtered ? 'No notifications match your filters' : 'No notifications yet'}
              description={filtered ? 'Try another type, status or period.' : 'New enquiries, payments, team changes and support replies will appear here.'} />
          ) : (
            <ul className="divide-y divide-border rounded-2xl bg-white shadow-panel">
              {rows.map((n) => (
                <li key={n.id} className={cn('flex items-start gap-3 px-4 py-3', openId === n.id ? 'bg-brand-50/60' : !n.is_read && 'bg-brand-50/30')}>
                  <span className={cn('mt-4 size-2 shrink-0 rounded-full', n.is_read ? 'bg-transparent' : 'bg-brand-600')} aria-label={n.is_read ? undefined : 'Unread'} />
                  <button type="button" onClick={() => setSearchParams({ notification: n.id })} className="flex min-w-0 flex-1 items-start gap-3 text-left">
                    <NotificationIcon category={n.category} />
                    <span className="min-w-0 flex-1">
                      <span className={cn('block truncate', n.is_read ? 'font-medium' : 'font-semibold')}>{n.title}</span>
                      {n.body && <span className="line-clamp-2 text-sm text-muted">{n.body}</span>}
                    </span>
                    <span className="hidden shrink-0 flex-col items-end gap-1 sm:flex">
                      <span className="text-xs text-muted">{relativeTime(n.created_at)}</span>
                      <span className={cn('rounded-md px-2 py-0.5 text-xs font-semibold', LEVEL_STYLE[n.level].className)}>{LEVEL_STYLE[n.level].label}</span>
                    </span>
                  </button>
                  <ActionMenu items={menu(n)} />
                </li>
              ))}
            </ul>
          )}
          {list.data && list.data.count > 0 && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 px-1 text-sm text-ink">
              <span>Showing {(list.data.page - 1) * list.data.page_size + 1} to {Math.min(list.data.page * list.data.page_size, list.data.count)} of {list.data.count} notifications</span>
              <Pagination page={params.page} totalPages={list.data.total_pages} count={list.data.count} onPage={(page) => setParams((p) => ({ ...p, page }))} />
            </div>
          )}
        </div>
        {openId && (
          <div className="xl:sticky xl:top-20 xl:self-start">
            <NotificationPanel id={openId} onClose={() => setSearchParams({})} />
          </div>
        )}
      </div>
    </>
  )
}
