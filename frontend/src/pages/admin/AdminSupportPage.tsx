import { CircleCheck, CircleX, ClipboardList, Hourglass, Inbox, LifeBuoy, MessageSquareReply, X } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAdminTicket, useAdminTicketAction, useAdminTickets, useAdminTicketSummary, useSupportAgents } from '@/api/workspace'
import { BarList } from '@/components/charts/BarList'
import { PageHero } from '@/components/panel/PageHero'
import { StatCard } from '@/components/panel/StatCard'
import { FilterSelect, SearchInput, Toolbar } from '@/components/panel/Toolbar'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { EmptyState, ErrorState, Spinner } from '@/components/ui/Feedback'
import { Pagination } from '@/components/ui/Pagination'
import { useToast } from '@/components/ui/toast'
import { useAuth } from '@/features/auth/AuthContext'
import { formatDateTime } from '@/features/leads/leadFormat'
import { Conversation, PriorityPill, TicketStatusPill } from '@/features/workspace/Bits'
import { STAFF_TRANSITIONS, TICKET_CATEGORY, TICKET_PRIORITY, TICKET_STATUS_ORDER, ticketStatusLabel } from '@/features/workspace/format'
import { ReplyBox } from '@/features/workspace/ReplyBox'
import { RequirePlatformPermission } from '@/routes/guards'
import type { TicketCategory, TicketPriority, TicketStatus } from '@/types/workspace'
import { cn } from '@/utils/cn'

const select = 'h-9 w-full rounded-lg border border-border bg-white px-2 text-sm disabled:opacity-60'

function AdminTicketPanel({ id, onClose }: { id: string; onClose: () => void }) {
  const { user } = useAuth()
  const toast = useToast()
  const ticket = useAdminTicket(id)
  const agents = useSupportAgents()
  const act = useAdminTicketAction()
  const [mode, setMode] = useState<'reply' | 'note'>('reply')
  const [replyStatus, setReplyStatus] = useState<TicketStatus | ''>('')
  const canManage = Boolean(user?.platform_permissions.includes('platform.support.manage'))
  const t = ticket.data
  const fail = (e: Error) => toast.show(e.message, 'error')

  return (
    <aside className="rounded-2xl bg-white p-5 shadow-panel" aria-label="Ticket details">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-[17px] font-bold text-ink">Ticket Details</h2>
        <button type="button" onClick={onClose} aria-label="Close details" className="rounded p-1 text-muted hover:bg-canvas"><X className="size-5" /></button>
      </div>
      {ticket.isPending ? <Spinner /> : ticket.isError ? <ErrorState error={ticket.error} onRetry={() => ticket.refetch()} /> : t && (
        <div className="space-y-5 text-sm">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-800">{t.reference}</span>
              <TicketStatusPill status={t.status} admin />
            </div>
            <p className="text-right text-xs text-muted">Created: {formatDateTime(t.created_at)}<br />Last update: {formatDateTime(t.last_activity_at)}</p>
          </div>
          <div>
            <p className="text-xs text-muted">Subject</p>
            <p className="font-semibold">{t.subject}</p>
          </div>
          <dl className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2">
            <dt className="text-muted">Business</dt>
            <dd className="truncate font-medium">{t.business_name || '—'}</dd>
            <dt className="text-muted">Customer</dt>
            <dd className="min-w-0"><span className="block truncate font-medium">{t.created_by_name}</span><span className="block truncate text-xs text-muted">{t.created_by_email}</span></dd>
            <dt className="text-muted">Category</dt>
            <dd>
              <select aria-label="Category" className={select} value={t.category} disabled={!canManage || act.isPending}
                onChange={(e) => act.mutate({ id, kind: 'update', category: e.target.value as TicketCategory }, { onError: fail })}>
                {Object.entries(TICKET_CATEGORY).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </dd>
            <dt className="text-muted">Priority</dt>
            <dd>
              <select aria-label="Priority" className={select} value={t.priority} disabled={!canManage || act.isPending}
                onChange={(e) => act.mutate({ id, kind: 'update', priority: e.target.value as TicketPriority }, { onError: fail })}>
                {Object.entries(TICKET_PRIORITY).map(([v, { label }]) => <option key={v} value={v}>{label}</option>)}
              </select>
            </dd>
            <dt className="text-muted">Status</dt>
            <dd>
              <select aria-label="Status" className={select} value={t.status} disabled={!canManage || act.isPending}
                onChange={(e) => act.mutate({ id, kind: 'status', status: e.target.value as TicketStatus }, { onSuccess: () => toast.show('Status updated.'), onError: fail })}>
                <option value={t.status}>{ticketStatusLabel(t.status, true)}</option>
                {STAFF_TRANSITIONS[t.status].map((s) => <option key={s} value={s}>{ticketStatusLabel(s, true)}</option>)}
              </select>
            </dd>
            <dt className="text-muted">Assigned to</dt>
            <dd>
              <select aria-label="Assigned to" className={select} value={t.assigned_to?.id ?? ''} disabled={!canManage || act.isPending}
                onChange={(e) => act.mutate({ id, kind: 'update', assigned_to: e.target.value || null }, { onSuccess: () => toast.show('Assignment updated.'), onError: fail })}>
                <option value="">Unassigned</option>
                {(agents.data ?? []).map((a) => <option key={a.id} value={a.id}>{a.name}{a.id === user?.id ? ' (me)' : ''}</option>)}
              </select>
            </dd>
          </dl>
          <div>
            <p className="mb-3 font-semibold">Conversation ({t.messages.filter((m) => m.kind === 'message').length})</p>
            <Conversation messages={t.messages} />
          </div>
          {canManage && (
            <div className="border-t border-border pt-3">
              <div role="tablist" aria-label="Reply type" className="mb-2 flex gap-4 border-b border-border text-sm">
                {(['reply', 'note'] as const).map((m) => (
                  <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)}
                    className={cn('-mb-px border-b-2 px-1 pb-2 font-medium', mode === m ? 'border-brand-700 text-brand-800' : 'border-transparent text-muted')}>
                    {m === 'reply' ? 'Reply' : 'Internal Note'}
                  </button>
                ))}
              </div>
              {mode === 'note' && <p className="mb-2 text-xs text-amber-800">Internal notes are only visible to the support team.</p>}
              {t.status === 'closed' && mode === 'reply' ? (
                <p className="rounded-lg bg-canvas px-3 py-2 text-muted">Reopen the ticket to reply.</p>
              ) : (
                <ReplyBox key={mode} loading={act.isPending} label={mode === 'reply' ? 'Send Reply' : 'Add Note'}
                  placeholder={mode === 'reply' ? 'Type your reply here…' : 'Add an internal note…'}
                  extra={mode === 'reply' && (
                    <select aria-label="Status after reply" value={replyStatus} onChange={(e) => setReplyStatus(e.target.value as TicketStatus | '')} className="h-8 rounded-lg border border-border bg-white px-2 text-xs">
                      <option value="">Keep status</option>
                      {STAFF_TRANSITIONS[t.status].map((s) => <option key={s} value={s}>Set: {ticketStatusLabel(s, true)}</option>)}
                    </select>
                  )}
                  onSend={(body, done) => act.mutate(
                    { id, kind: 'reply', body, internal: mode === 'note', status: mode === 'reply' && replyStatus ? replyStatus : undefined },
                    { onSuccess: () => { done(); setReplyStatus(''); toast.show(mode === 'reply' ? 'Reply sent to the customer.' : 'Note added.') }, onError: fail },
                  )} />
              )}
            </div>
          )}
        </div>
      )}
    </aside>
  )
}

const EMPTY = { search: '', status: '', category: '', priority: '', assigned: '' }

export function AdminSupportPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const openId = searchParams.get('ticket')
  const [params, setParams] = useState({ page: 1, ...EMPTY })
  const list = useAdminTickets({ ...params, page_size: 10 })
  const summary = useAdminTicketSummary()
  const set = (patch: Partial<typeof params>) => setParams((p) => ({ ...p, page: 1, ...patch }))
  const count = (s: TicketStatus) => summary.data?.statuses.find((x) => x.key === s)?.count ?? 0
  const total = summary.data?.total ?? 0
  const pct = (n: number) => (total ? `${Math.round((n / total) * 100)}% of total` : undefined)
  const rows = list.data?.results ?? []
  const filtered = Object.entries(EMPTY).some(([k]) => params[k as keyof typeof EMPTY])

  return (
    <RequirePlatformPermission code="platform.support.view">
      <PageHero icon={LifeBuoy} title="Support Tickets" description="Manage and resolve customer support tickets from all businesses." />
      <div className="mb-4 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 2xl:grid-cols-6">
        <StatCard icon={ClipboardList} tone="violet" label="Total Tickets" value={summary.data ? total : '—'} loading={summary.isPending} hint={summary.data && `${summary.data.unassigned} unassigned`} />
        <StatCard icon={Inbox} tone="pink" label="Open" value={summary.data ? count('open') : '—'} loading={summary.isPending} hint={pct(count('open'))} />
        <StatCard icon={Hourglass} tone="amber" label="In Progress" value={summary.data ? count('in_progress') : '—'} loading={summary.isPending} hint={pct(count('in_progress'))} />
        <StatCard icon={MessageSquareReply} label="Waiting for Customer" value={summary.data ? count('waiting_for_user') : '—'} loading={summary.isPending} hint={pct(count('waiting_for_user'))} />
        <StatCard icon={CircleCheck} tone="green" label="Resolved" value={summary.data ? count('resolved') : '—'} loading={summary.isPending} hint={pct(count('resolved'))} />
        <StatCard icon={CircleX} tone="slate" label="Closed" value={summary.data ? count('closed') : '—'} loading={summary.isPending} hint={pct(count('closed'))} />
      </div>

      <div className={openId ? 'grid gap-6 2xl:grid-cols-[minmax(0,1fr)_26rem]' : ''}>
        <div className="min-w-0">
          <div className="mb-3 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Ticket status">
            {[{ key: '', label: 'All Tickets', n: total }, ...TICKET_STATUS_ORDER.map((s) => ({ key: s, label: ticketStatusLabel(s, true), n: count(s) }))].map((t) => (
              <button key={t.key || 'all'} type="button" role="tab" aria-selected={params.status === t.key} onClick={() => set({ status: t.key })}
                className={cn('h-10 shrink-0 rounded-lg px-4 text-sm font-medium', params.status === t.key ? 'bg-brand-700 text-white shadow-pill' : 'bg-white text-ink ring-1 ring-[#d5e5fa] hover:bg-brand-50')}>
                {t.label} ({t.n})
              </button>
            ))}
          </div>
          <Toolbar end={filtered && <Button variant="ghost" size="sm" onClick={() => set(EMPTY)}>Reset</Button>}>
            <SearchInput value={params.search} onChange={(search) => set({ search })} placeholder="Search by ticket ID, subject, business, email…" />
            <FilterSelect label="Category" value={params.category} onChange={(category) => set({ category })}
              options={[{ value: '', label: 'All categories' }, ...Object.entries(TICKET_CATEGORY).map(([value, label]) => ({ value, label }))]} />
            <FilterSelect label="Priority" value={params.priority} onChange={(priority) => set({ priority })}
              options={[{ value: '', label: 'All priorities' }, ...Object.entries(TICKET_PRIORITY).map(([value, { label }]) => ({ value, label }))]} />
            <FilterSelect label="Assigned" value={params.assigned} onChange={(assigned) => set({ assigned })}
              options={[{ value: '', label: 'Anyone' }, { value: 'me', label: 'Assigned to me' }, { value: 'none', label: 'Unassigned' }]} />
          </Toolbar>

          {list.isPending ? (
            <Spinner label="Loading tickets…" />
          ) : list.isError ? (
            <ErrorState error={list.error} onRetry={() => list.refetch()} />
          ) : rows.length === 0 ? (
            <EmptyState icon={LifeBuoy} title={filtered ? 'No tickets match your filters' : 'No support tickets yet'}
              description={filtered ? 'Try another status, category or priority.' : 'Tickets raised by businesses appear here.'} />
          ) : (
            <div className="overflow-x-auto rounded-2xl bg-white shadow-panel">
              <table className="w-full text-left text-sm">
                <thead className="bg-thead text-[13px] font-semibold text-ink">
                  <tr>
                    <th scope="col" className="px-4 py-3">#</th>
                    <th scope="col" className="px-3 py-3">Subject</th>
                    <th scope="col" className="hidden px-3 py-3 md:table-cell">Business</th>
                    <th scope="col" className="hidden px-3 py-3 xl:table-cell">Customer</th>
                    <th scope="col" className="hidden px-3 py-3 lg:table-cell">Category</th>
                    <th scope="col" className="px-3 py-3">Priority</th>
                    <th scope="col" className="px-3 py-3">Status</th>
                    <th scope="col" className="hidden px-3 py-3 xl:table-cell">Created On</th>
                    <th scope="col" className="hidden px-3 py-3 lg:table-cell">Last Update</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((t) => (
                    <tr key={t.id} onClick={() => setSearchParams({ ticket: t.id })} className={cn('cursor-pointer hover:bg-canvas', openId === t.id && 'bg-brand-50/60')}>
                      <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">{t.reference}</td>
                      <td className="px-3 py-3">
                        <button type="button" className="max-w-60 truncate text-left font-medium text-brand-800 hover:underline" onClick={() => setSearchParams({ ticket: t.id })}>{t.subject}</button>
                        <p className="text-xs text-muted">{t.assigned_to ? `Assigned: ${t.assigned_to.name}` : 'Unassigned'}</p>
                      </td>
                      <td className="hidden px-3 py-3 md:table-cell">{t.business_name || '—'}</td>
                      <td className="hidden px-3 py-3 xl:table-cell">{t.created_by_name}</td>
                      <td className="hidden px-3 py-3 text-muted lg:table-cell">{TICKET_CATEGORY[t.category]}</td>
                      <td className="px-3 py-3"><PriorityPill priority={t.priority} /></td>
                      <td className="px-3 py-3"><TicketStatusPill status={t.status} admin /></td>
                      <td className="hidden px-3 py-3 text-xs whitespace-nowrap text-muted xl:table-cell">{formatDateTime(t.created_at)}</td>
                      <td className="hidden px-3 py-3 text-xs whitespace-nowrap text-muted lg:table-cell">{formatDateTime(t.last_activity_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {list.data && list.data.count > 0 && (
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
              <span>Showing {(list.data.page - 1) * list.data.page_size + 1} to {Math.min(list.data.page * list.data.page_size, list.data.count)} of {list.data.count} tickets</span>
              <Pagination page={params.page} totalPages={list.data.total_pages} count={list.data.count} onPage={(page) => setParams((p) => ({ ...p, page }))} />
            </div>
          )}

          {summary.data && total > 0 && (
            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader title="Tickets by Category" />
                <CardBody><BarList rows={summary.data.categories.filter((c) => c.count).map((c) => ({ key: c.key, label: c.label, value: c.count }))} /></CardBody>
              </Card>
              <Card>
                <CardHeader title="Tickets by Status" />
                <CardBody><BarList rows={summary.data.statuses.map((s) => ({ key: s.key, label: ticketStatusLabel(s.key, true), value: s.count }))} /></CardBody>
              </Card>
            </div>
          )}
        </div>
        {openId && (
          <div className="2xl:sticky 2xl:top-20 2xl:self-start">
            <AdminTicketPanel id={openId} onClose={() => setSearchParams({})} />
          </div>
        )}
      </div>
    </RequirePlatformPermission>
  )
}
