import { CircleCheck, Clock, Hourglass, LifeBuoy, MessageSquareReply, Plus, ShieldAlert, X } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTicket, useTicketReply, useTickets, useTicketStatus, useTicketSummary } from '@/api/workspace'
import { PageHero } from '@/components/panel/PageHero'
import { StatCard } from '@/components/panel/StatCard'
import { FilterSelect, SearchInput, Toolbar } from '@/components/panel/Toolbar'
import { Button } from '@/components/ui/Button'
import { EmptyState, ErrorState, Spinner } from '@/components/ui/Feedback'
import { Pagination } from '@/components/ui/Pagination'
import { useToast } from '@/components/ui/toast'
import { useActiveBusiness } from '@/features/business/BusinessContext'
import { formatDateTime } from '@/features/leads/leadFormat'
import { Conversation, PriorityPill, TicketStatusPill } from '@/features/workspace/Bits'
import { canReply, relativeTime, requesterActions, TICKET_CATEGORY, TICKET_STATUS, TICKET_STATUS_ORDER } from '@/features/workspace/format'
import { NewTicketModal } from '@/features/workspace/NewTicketModal'
import { ReplyBox } from '@/features/workspace/ReplyBox'
import type { TicketStatus } from '@/types/workspace'
import { cn } from '@/utils/cn'

function TicketPanel({ id, onClose }: { id: string; onClose: () => void }) {
  const { businessId } = useActiveBusiness()
  const toast = useToast()
  const ticket = useTicket(businessId, id)
  const reply = useTicketReply()
  const setStatus = useTicketStatus()
  const t = ticket.data

  return (
    <aside className="rounded-2xl bg-white p-5 shadow-panel" aria-label="Ticket details">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-[17px] font-bold text-ink">Ticket Details</h2>
        <button type="button" onClick={onClose} aria-label="Close details" className="rounded p-1 text-muted hover:bg-canvas"><X className="size-5" /></button>
      </div>
      {ticket.isPending ? <Spinner /> : ticket.isError ? <ErrorState error={ticket.error} onRetry={() => ticket.refetch()} /> : t && (
        <div className="space-y-5">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-800">{t.reference}</span>
              <TicketStatusPill status={t.status} />
              <PriorityPill priority={t.priority} />
            </div>
            <p className="mt-2 font-semibold">{t.subject}</p>
            <p className="text-xs text-muted">{TICKET_CATEGORY[t.category]} · opened {formatDateTime(t.created_at)} by {t.is_mine ? 'you' : t.created_by_name}</p>
          </div>
          {t.status === 'waiting_for_user' && (
            <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-800">Support is waiting for your reply.</p>
          )}
          <div>
            <p className="mb-3 font-semibold">Conversation ({t.messages.filter((m) => m.kind === 'message').length})</p>
            <Conversation messages={t.messages} />
          </div>
          {canReply(t.status) ? (
            <ReplyBox loading={reply.isPending}
              onSend={(body, done) => reply.mutate({ id, body }, { onSuccess: () => { done(); toast.show('Reply sent.') }, onError: (e) => toast.show(e.message, 'error') })} />
          ) : (
            <p className="rounded-lg bg-canvas px-3 py-2 text-sm text-muted">This ticket is closed. Create a new ticket if you still need help.</p>
          )}
          <div className="flex flex-wrap gap-2 border-t border-border pt-4">
            {requesterActions(t.status).map((a) => (
              <Button key={a.status} variant={a.status === 'closed' ? 'secondary' : 'primary'} size="sm" loading={setStatus.isPending}
                onClick={() => setStatus.mutate({ id, status: a.status }, { onSuccess: () => toast.show(a.status === 'closed' ? 'Ticket closed.' : 'Ticket reopened.'), onError: (e) => toast.show(e.message, 'error') })}>
                {a.label}
              </Button>
            ))}
          </div>
        </div>
      )}
    </aside>
  )
}

export function SupportPage() {
  const { businessId, can } = useActiveBusiness()
  const toast = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const openId = searchParams.get('ticket')
  const [creating, setCreating] = useState(false)
  const [params, setParams] = useState({ page: 1, search: '', status: '', category: '', mine: '' })
  const list = useTickets(businessId, { ...params, page_size: 10 })
  const summary = useTicketSummary(businessId)
  const set = (patch: Partial<typeof params>) => setParams((p) => ({ ...p, page: 1, ...patch }))
  const count = (s: TicketStatus) => summary.data?.statuses.find((x) => x.key === s)?.count ?? 0
  const rows = list.data?.results ?? []
  const filtered = Boolean(params.search || params.status || params.category || params.mine)
  const canCreate = can('support.create')

  if (!can('support.view') && !canCreate) {
    return <EmptyState icon={ShieldAlert} title="You don't have access to support tickets" description="Ask the business owner to give your role the “Create support tickets” permission." />
  }

  return (
    <>
      <PageHero icon={LifeBuoy} title="Help & Support" description="Raise a ticket with the myEcatalogues support team and follow the conversation here. You’ll get a notification and an email when we reply."
        action={canCreate && <Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>Create Ticket</Button>} />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard icon={LifeBuoy} tone="pink" label="Open" value={summary.data ? count('open') : '—'} loading={summary.isPending} />
        <StatCard icon={Hourglass} tone="amber" label="In progress" value={summary.data ? count('in_progress') : '—'} loading={summary.isPending} />
        <StatCard icon={MessageSquareReply} label="Waiting for you" value={summary.data ? count('waiting_for_user') : '—'} loading={summary.isPending} />
        <StatCard icon={CircleCheck} tone="green" label="Resolved & closed" value={summary.data ? count('resolved') + count('closed') : '—'} loading={summary.isPending} />
      </div>

      <div className={openId ? 'grid gap-6 xl:grid-cols-[minmax(0,1fr)_26rem]' : ''}>
        <div className="min-w-0">
          <div className="mb-3 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Ticket status">
            {[{ key: '', label: 'All Tickets', n: summary.data?.total ?? 0 }, ...TICKET_STATUS_ORDER.map((s) => ({ key: s, label: TICKET_STATUS[s].label, n: count(s) }))].map((t) => (
              <button key={t.key || 'all'} type="button" role="tab" aria-selected={params.status === t.key} onClick={() => set({ status: t.key })}
                className={cn('h-10 shrink-0 rounded-lg px-4 text-sm font-medium', params.status === t.key ? 'bg-brand-700 text-white shadow-pill' : 'bg-white text-ink ring-1 ring-[#d5e5fa] hover:bg-brand-50')}>
                {t.label} ({t.n})
              </button>
            ))}
          </div>
          <Toolbar>
            <SearchInput value={params.search} onChange={(search) => set({ search })} placeholder="Search by ticket ID or subject…" />
            <FilterSelect label="Category" value={params.category} onChange={(category) => set({ category })}
              options={[{ value: '', label: 'All categories' }, ...Object.entries(TICKET_CATEGORY).map(([value, label]) => ({ value, label }))]} />
            {can('support.view') && (
              <FilterSelect label="Raised by" value={params.mine} onChange={(mine) => set({ mine })}
                options={[{ value: '', label: 'Whole team' }, { value: 'true', label: 'Only me' }]} />
            )}
          </Toolbar>

          {list.isPending ? (
            <Spinner label="Loading tickets…" />
          ) : list.isError ? (
            <ErrorState error={list.error} onRetry={() => list.refetch()} />
          ) : rows.length === 0 ? (
            <EmptyState icon={LifeBuoy} title={filtered ? 'No tickets match your filters' : 'No support tickets yet'}
              description={filtered ? 'Try another status or category.' : 'If something isn’t working, create a ticket and our team will help.'}
              action={!filtered && canCreate && <Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>Create Ticket</Button>} />
          ) : (
            <div className="overflow-x-auto rounded-2xl bg-white shadow-panel">
              <table className="w-full text-left text-sm">
                <thead className="bg-thead text-[13px] font-semibold text-ink">
                  <tr>
                    <th scope="col" className="px-4 py-3">#</th>
                    <th scope="col" className="px-3 py-3">Subject</th>
                    <th scope="col" className="hidden px-3 py-3 md:table-cell">Category</th>
                    <th scope="col" className="hidden px-3 py-3 sm:table-cell">Priority</th>
                    <th scope="col" className="px-3 py-3">Status</th>
                    <th scope="col" className="hidden px-3 py-3 lg:table-cell">Last update</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((t) => (
                    <tr key={t.id} onClick={() => setSearchParams({ ticket: t.id })} className={cn('cursor-pointer hover:bg-canvas', openId === t.id && 'bg-brand-50/60')}>
                      <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">{t.reference}</td>
                      <td className="px-3 py-3">
                        <button type="button" className="max-w-72 truncate text-left font-medium text-brand-800 hover:underline" onClick={() => setSearchParams({ ticket: t.id })}>{t.subject}</button>
                        <p className="text-xs text-muted">{t.is_mine ? 'You' : t.created_by_name} · {t.message_count} message{t.message_count === 1 ? '' : 's'}</p>
                      </td>
                      <td className="hidden px-3 py-3 text-muted md:table-cell">{TICKET_CATEGORY[t.category]}</td>
                      <td className="hidden px-3 py-3 sm:table-cell"><PriorityPill priority={t.priority} /></td>
                      <td className="px-3 py-3"><TicketStatusPill status={t.status} /></td>
                      <td className="hidden px-3 py-3 text-xs whitespace-nowrap text-muted lg:table-cell"><Clock className="mr-1 inline size-3.5" aria-hidden />{relativeTime(t.last_activity_at)}</td>
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
        </div>
        {openId && (
          <div className="xl:sticky xl:top-20 xl:self-start">
            <TicketPanel id={openId} onClose={() => setSearchParams({})} />
          </div>
        )}
      </div>

      {creating && (
        <NewTicketModal onClose={() => setCreating(false)}
          onCreated={(t) => { setCreating(false); toast.show(`Ticket ${t.reference} created.`); setSearchParams({ ticket: t.id }) }} />
      )}
    </>
  )
}
