import heroArt from '@/assets/reference/hero-enquiries.webp'
import { CalendarDays, CircleCheck, CircleX, Hourglass, Mail, MessageCircle, MessagesSquare, Phone, Trash2, UserPlus, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useCatalogues } from '@/api/content'
import { useDeleteEnquiry, useEnquiries, useEnquiry, useEnquiryBulk, useEnquirySummary, useUpdateEnquiry } from '@/api/leads'
import { PageHero } from '@/components/panel/PageHero'
import { StatCard } from '@/components/panel/StatCard'
import { FilterSelect, SearchInput, Toolbar } from '@/components/panel/Toolbar'
import { Button } from '@/components/ui/Button'
import { buttonClasses } from '@/components/ui/buttonStyles'
import { EmptyState, ErrorState, Spinner } from '@/components/ui/Feedback'
import { ConfirmDialog } from '@/components/ui/Modal'
import { Pagination } from '@/components/ui/Pagination'
import { useToast } from '@/components/ui/toast'
import { useActiveBusiness } from '@/features/business/BusinessContext'
import { formatDate, formatPrice } from '@/features/content/format'
import { MediaThumb } from '@/features/content/MediaThumb'
import { Avatar, ContactActions, EnquiryStatusPill } from '@/features/leads/LeadBits'
import { ENQUIRY_SOURCE, ENQUIRY_STATUS, formatDateTime, STATUS_ORDER, whatsappHref } from '@/features/leads/leadFormat'
import { RequirePermission } from '@/routes/guards'
import type { Enquiry, EnquirySource, EnquiryStatus } from '@/types/leads'
import { cn } from '@/utils/cn'

// Source chips coloured as in the reference (Website blue, QR Code violet, WhatsApp green, Social pink, Search amber).
const SOURCE_TONE: Record<EnquirySource, string> = {
  catalogue: 'bg-[#e0ebff] text-[#1f5fe0]',
  qr_code: 'bg-[#efe4ff] text-[#7c3aed]',
  whatsapp: 'bg-[#dcf7e5] text-[#14a04a]',
  social: 'bg-[#ffe4ef] text-[#d6336c]',
  search: 'bg-[#fff1d6] text-[#c2620a]',
  manual: 'bg-[#eceff5] text-[#55607f]',
}
const timeFmt = new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
const timeOf = (iso: string) => timeFmt.format(new Date(iso))

function EnquiryPanel({ id, onClose }: { id: string; onClose: () => void }) {
  const { businessId, can } = useActiveBusiness()
  const toast = useToast()
  const enquiry = useEnquiry(businessId, id)
  const update = useUpdateEnquiry()
  const del = useDeleteEnquiry()
  const [notes, setNotes] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  useEffect(() => setNotes(enquiry.data?.internal_notes ?? ''), [enquiry.data?.id, enquiry.data?.internal_notes])
  const canUpdate = can('enquiry.update')

  return (
    <aside className="rounded-2xl bg-white p-5 shadow-panel" aria-label="Enquiry details">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-[17px] font-bold text-ink">Enquiry Details</h2>
        <button type="button" onClick={onClose} aria-label="Close details" className="rounded p-1 text-muted hover:bg-canvas"><X className="size-5" /></button>
      </div>
      {enquiry.isPending ? (
        <Spinner />
      ) : enquiry.isError ? (
        <ErrorState error={enquiry.error} onRetry={() => enquiry.refetch()} />
      ) : (
        <Detail e={enquiry.data} />
      )}
      {enquiry.data && (
        <div className="mt-5 space-y-4 border-t border-border pt-4">
          <label className="block text-sm font-medium">
            Status
            <select
              value={enquiry.data.status}
              disabled={!canUpdate || update.isPending}
              onChange={(ev) => update.mutate({ id, status: ev.target.value as EnquiryStatus }, { onSuccess: () => toast.show('Status updated.'), onError: (e) => toast.show(e.message, 'error') })}
              className="mt-1.5 block h-10 w-full rounded-lg border border-border bg-white px-3 text-sm"
            >
              {STATUS_ORDER.map((s) => <option key={s} value={s}>{ENQUIRY_STATUS[s].label}</option>)}
            </select>
          </label>
          <label className="block text-sm font-medium">
            Notes <span className="font-normal text-muted">(internal — never shown to the customer)</span>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} disabled={!canUpdate} maxLength={5000} rows={3}
              placeholder="Add notes about this enquiry…" className="mt-1.5 block w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-brand-600 focus:outline-none" />
          </label>
          {canUpdate && notes !== enquiry.data.internal_notes && (
            <Button size="sm" loading={update.isPending} onClick={() => update.mutate({ id, internal_notes: notes }, { onSuccess: () => toast.show('Notes saved.') })}>Save notes</Button>
          )}
          <div className="grid grid-cols-2 gap-2">
            <a href={whatsappHref(enquiry.data.phone, `Hi ${enquiry.data.name}, thanks for your enquiry${enquiry.data.product_name ? ` about ${enquiry.data.product_name}` : ''}.`)}
              target="_blank" rel="noreferrer" className={buttonClasses('primary', 'md', 'bg-emerald-600 hover:bg-emerald-700')}>
              <MessageCircle className="size-4" aria-hidden /> Reply on WhatsApp
            </a>
            {enquiry.data.email ? (
              <a href={`mailto:${enquiry.data.email}?subject=${encodeURIComponent(`Your enquiry${enquiry.data.product_name ? ` — ${enquiry.data.product_name}` : ''}`)}`} className={buttonClasses('primary', 'md')}>
                <Mail className="size-4" aria-hidden /> Send Email
              </a>
            ) : (
              <span className={buttonClasses('secondary', 'md', 'pointer-events-none opacity-60')} title="No email provided"><Mail className="size-4" aria-hidden /> No email</span>
            )}
          </div>
          {can('enquiry.delete') && (
            <Button variant="ghost" size="sm" icon={<Trash2 className="size-4" />} className="text-red-600" onClick={() => setConfirmDelete(true)}>Delete enquiry</Button>
          )}
          <ConfirmDialog open={confirmDelete} onClose={() => setConfirmDelete(false)} loading={del.isPending}
            title="Delete this enquiry?" description="The enquiry is removed permanently. The customer record is kept." confirmLabel="Delete"
            onConfirm={() => del.mutate(id, { onSuccess: () => { toast.show('Enquiry deleted.'); setConfirmDelete(false); onClose() } })} />
        </div>
      )}
    </aside>
  )
}

function Detail({ e }: { e: Enquiry }) {
  return (
    <div className="space-y-4 text-sm">
      <div className="flex items-start gap-3">
        <Avatar name={e.name} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{e.name}</p>
          <div className="mt-1"><ContactActions phone={e.phone} email={e.email} /></div>
        </div>
        <EnquiryStatusPill status={e.status} />
      </div>
      <dl className="space-y-1.5 text-slate-700">
        <div className="flex items-center gap-2"><dt className="sr-only">Phone</dt><Phone className="size-4 text-muted" aria-hidden /><dd>{e.phone}</dd></div>
        {e.email && <div className="flex items-center gap-2"><dt className="sr-only">Email</dt><Mail className="size-4 text-muted" aria-hidden /><dd className="truncate">{e.email}</dd></div>}
        <div className="flex items-center gap-2"><CalendarDays className="size-4 text-muted" aria-hidden /> {formatDateTime(e.created_at)}</div>
        <div>Source: <span className="font-medium">{ENQUIRY_SOURCE[e.source]}</span>{e.catalogue && <> · {e.catalogue.name}</>}</div>
        {e.customer && <div><Link to={`/app/customers?customer=${e.customer.id}`} className="font-medium text-brand-700 hover:underline">View customer →</Link></div>}
      </dl>
      {(e.product || e.product_name) && (
        <div>
          <p className="mb-1.5 font-semibold">Interested product</p>
          <div className="flex gap-3 rounded-lg border border-border p-2.5">
            <MediaThumb media={e.product?.thumbnail} className="size-14 shrink-0 rounded-md" />
            <div className="min-w-0">
              <p className="truncate font-medium">{e.product?.name ?? e.product_name}</p>
              {e.product?.sku && <p className="text-xs text-muted">SKU: {e.product.sku}</p>}
              {e.quantity && <p className="text-xs text-muted">Qty: {e.quantity}</p>}
              {e.product?.price && <p className="text-sm font-semibold">{formatPrice(e.product.price, e.product.currency)}</p>}
              {e.product ? <Link to={`/app/products/${e.product.id}`} className="text-xs font-medium text-brand-700 hover:underline">View product →</Link> : <p className="text-xs text-muted">Product no longer exists</p>}
            </div>
          </div>
        </div>
      )}
      <div>
        <p className="mb-1.5 font-semibold">Message</p>
        <p className="rounded-lg bg-canvas p-3 whitespace-pre-line text-slate-700">{e.message}</p>
      </div>
    </div>
  )
}

export function EnquiriesPage() {
  const { businessId, can } = useActiveBusiness()
  const toast = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const [params, setParams] = useState({ page: 1, search: '', status: '', catalogue: '', created_from: '', created_to: '' })
  const [selected, setSelected] = useState<string[]>([])
  const [bulkStatus, setBulkStatus] = useState('')
  const openId = searchParams.get('enquiry')
  const list = useEnquiries(businessId, { ...params, page_size: 10 })
  const summary = useEnquirySummary(businessId)
  const catalogues = useCatalogues(businessId, { page_size: 100, ordering: 'name' })
  const bulk = useEnquiryBulk()
  const set = (patch: Partial<typeof params>) => { setSelected([]); setParams((p) => ({ ...p, page: 1, ...patch })) }
  const reset = () => set({ search: '', status: '', catalogue: '', created_from: '', created_to: '' })
  const rows = list.data?.results ?? []
  const s = summary.data

  return (
    <RequirePermission codes={['enquiry.view']}>
      <PageHero icon={MessagesSquare} title="Enquiries" description="View and manage all customer enquiries from your catalogues. Respond quickly and convert enquiries into sales."
        illustration={heroArt} highlights={['Manage all enquiries in one place', 'View product & customer details', 'Respond via WhatsApp / Email', 'Track status and convert to sales']} />
      <div className="mb-4 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <StatCard icon={MessagesSquare} label="Total enquiries" value={s?.total ?? '—'} loading={summary.isPending} hint={s ? `${s.this_month} this month` : undefined} />
        <StatCard icon={UserPlus} tone="pink" label="New" value={s?.new ?? '—'} loading={summary.isPending} />
        <StatCard icon={Hourglass} tone="amber" label="In progress" value={s ? s.in_progress + s.contacted : '—'} loading={summary.isPending} hint={s ? `${s.contacted} contacted` : undefined} />
        <StatCard icon={CircleCheck} tone="green" label="Converted" value={s?.converted ?? '—'} loading={summary.isPending} />
        <StatCard icon={CircleX} tone="red" label="Closed" value={s?.closed ?? '—'} loading={summary.isPending} />
      </div>

      <div className={openId ? 'grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]' : ''}>
        <div className="min-w-0">
          <Toolbar end={<Button variant="ghost" size="sm" onClick={reset}>Reset</Button>}>
            <SearchInput value={params.search} onChange={(search) => set({ search })} placeholder="Search by name, email, product…" />
            <FilterSelect label="Status" value={params.status} onChange={(status) => set({ status })}
              options={[{ value: '', label: 'All status' }, ...STATUS_ORDER.map((v) => ({ value: v, label: ENQUIRY_STATUS[v].label }))]} />
            <FilterSelect label="Catalogue" value={params.catalogue} onChange={(catalogue) => set({ catalogue })}
              options={[{ value: '', label: 'All catalogues' }, ...(catalogues.data?.results ?? []).map((c) => ({ value: c.id, label: c.name }))]} />
            <label className="flex items-center gap-1.5 text-sm text-muted">
              <CalendarDays className="size-4" aria-hidden />
              <input type="date" aria-label="From date" value={params.created_from} max={params.created_to || undefined} onChange={(e) => set({ created_from: e.target.value })} className="h-10 rounded-lg border border-border px-2 text-sm text-ink" />
              –
              <input type="date" aria-label="To date" value={params.created_to} min={params.created_from || undefined} onChange={(e) => set({ created_to: e.target.value })} className="h-10 rounded-lg border border-border px-2 text-sm text-ink" />
            </label>
          </Toolbar>

          {selected.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-brand-200 bg-brand-50 px-4 py-2 text-sm">
              <span className="font-medium">{selected.length} selected</span>
              {can('enquiry.update') && (
                <>
                  <select aria-label="New status" value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)} className="h-8 rounded-lg border border-border bg-white px-2 text-sm">
                    <option value="">Set status…</option>
                    {STATUS_ORDER.map((v) => <option key={v} value={v}>{ENQUIRY_STATUS[v].label}</option>)}
                  </select>
                  <Button size="sm" disabled={!bulkStatus} loading={bulk.isPending}
                    onClick={() => bulk.mutate({ ids: selected, action: 'set_status', status: bulkStatus as EnquiryStatus }, { onSuccess: (r) => { toast.show(`${r.updated} enquiries updated.`); setSelected([]); setBulkStatus('') } })}>
                    Apply
                  </Button>
                </>
              )}
              <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setSelected([])}>Clear</Button>
            </div>
          )}

          {list.isPending ? (
            <Spinner label="Loading enquiries…" />
          ) : list.isError ? (
            <ErrorState error={list.error} onRetry={() => list.refetch()} />
          ) : rows.length === 0 ? (
            <EmptyState icon={MessagesSquare}
              title={params.search || params.status || params.catalogue || params.created_from ? 'No enquiries match your filters' : 'No enquiries yet'}
              description="Enquiries arrive when visitors use the enquiry form on your published catalogues. Share a catalogue link or QR code to get started."
              action={!params.search && <Link to="/app/qr-codes" className={buttonClasses('primary', 'md')}>Share a catalogue</Link>} />
          ) : (
            <div className="overflow-x-auto rounded-2xl bg-white shadow-panel">
              <table className="w-full text-left text-sm">
                <thead className="bg-thead text-[13px] font-semibold text-ink">
                  <tr>
                    <th scope="col" className="w-10 px-4 py-3">
                      <input type="checkbox" aria-label="Select all" className="size-4 accent-brand-700" checked={rows.length > 0 && rows.every((r) => selected.includes(r.id))}
                        onChange={(e) => setSelected(e.target.checked ? rows.map((r) => r.id) : [])} />
                    </th>
                    <th scope="col" className="px-3 py-3">Customer</th>
                    <th scope="col" className="px-3 py-3">Product / Enquiry details</th>
                    <th scope="col" className="hidden px-3 py-3 lg:table-cell">Source</th>
                    <th scope="col" className="hidden px-3 py-3 md:table-cell">Date</th>
                    <th scope="col" className="px-3 py-3">Status</th>
                    <th scope="col" className="px-3 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((e) => (
                    <tr key={e.id} onClick={() => setSearchParams({ enquiry: e.id })} className={`cursor-pointer hover:bg-canvas ${openId === e.id ? 'bg-brand-50/60' : ''}`}>
                      <td className="px-4 py-3" onClick={(ev) => ev.stopPropagation()}>
                        <input type="checkbox" aria-label={`Select enquiry from ${e.name}`} className="size-4 accent-brand-700" checked={selected.includes(e.id)}
                          onChange={(ev) => setSelected((cur) => (ev.target.checked ? [...cur, e.id] : cur.filter((x) => x !== e.id)))} />
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar name={e.name} />
                          <div className="min-w-0">
                            <p className="truncate font-medium">{e.name}</p>
                            <p className="truncate text-xs text-muted">{e.phone}</p>
                            {e.email && <p className="truncate text-xs text-muted">{e.email}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-3">
                          <MediaThumb media={e.product?.thumbnail} className="size-11 shrink-0 rounded-md" />
                          <div className="min-w-0 max-w-56">
                            <p className="truncate font-medium">{e.product_name || 'General enquiry'}</p>
                            <p className="truncate text-xs text-muted">{e.catalogue_name}</p>
                            <p className="truncate text-xs text-muted">{e.quantity ? `Qty: ${e.quantity} · ` : ''}{e.message}</p>
                          </div>
                        </div>
                      </td>
                      <td className="hidden px-3 py-3 lg:table-cell"><span className={cn('rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap', SOURCE_TONE[e.source])}>{ENQUIRY_SOURCE[e.source]}</span></td>
                      <td className="hidden px-3 py-3 text-[13px] whitespace-nowrap text-ink md:table-cell">
                        {formatDate(e.created_at)}<span className="block">{timeOf(e.created_at)}</span>
                      </td>
                      <td className="px-3 py-3"><EnquiryStatusPill status={e.status} /></td>
                      <td className="px-3 py-3" onClick={(ev) => ev.stopPropagation()}><ContactActions phone={e.phone} email={e.email} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {list.data && list.data.count > 0 && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 px-1 text-sm text-ink">
              <span>Showing {(list.data.page - 1) * list.data.page_size + 1} to {Math.min(list.data.page * list.data.page_size, list.data.count)} of {list.data.count} enquiries</span>
              <Pagination page={params.page} totalPages={list.data.total_pages} count={list.data.count} onPage={(page) => { setSelected([]); setParams((p) => ({ ...p, page })) }} />
            </div>
          )}
        </div>
        {openId && (
          <div className="xl:sticky xl:top-20 xl:self-start">
            <EnquiryPanel id={openId} onClose={() => setSearchParams({})} />
          </div>
        )}
      </div>
    </RequirePermission>
  )
}
