import { Archive, BookOpen, CircleCheck, Copy, Download, ExternalLink, FilePen, Package, Plus, ShieldOff, X } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { downloadAdminQr, useAdminCatalogues, useAdminCatalogueSummary, useTakedownCatalogue } from '@/api/platform'
import { PageHero } from '@/components/panel/PageHero'
import { StatCard } from '@/components/panel/StatCard'
import { StatusPill } from '@/components/panel/StatusPill'
import { FilterSelect, SearchInput, Toolbar } from '@/components/panel/Toolbar'
import { Button } from '@/components/ui/Button'
import { EmptyState, ErrorState, Spinner } from '@/components/ui/Feedback'
import { Pagination } from '@/components/ui/Pagination'
import { useToast } from '@/components/ui/toast'
import { useAuth } from '@/features/auth/AuthContext'
import { MediaThumb } from '@/features/content/MediaThumb'
import { formatDateTime } from '@/features/leads/leadFormat'
import { AdminQr } from '@/features/platform/AdminQr'
import { ReasonDialog } from '@/features/platform/ReasonDialog'
import { RequirePlatformPermission } from '@/routes/guards'
import type { AdminCatalogue } from '@/types/platform'
import { cn } from '@/utils/cn'

function CataloguePanel({ catalogue: c, onClose }: { catalogue: AdminCatalogue; onClose: () => void }) {
  const { user } = useAuth()
  const toast = useToast()
  const takedown = useTakedownCatalogue()
  const [confirm, setConfirm] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const canManage = Boolean(user?.platform_permissions.includes('platform.catalogue.manage'))
  return (
    <aside className="rounded-2xl bg-white p-5 shadow-panel" aria-label="Catalogue preview">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-[17px] font-bold text-ink">Catalogue Preview</h2>
        <button type="button" onClick={onClose} aria-label="Close details" className="rounded p-1 text-muted hover:bg-canvas"><X className="size-5" /></button>
      </div>
      <MediaThumb media={c.cover} alt={c.name} className="aspect-[16/10] w-full rounded-xl" />
      <dl className="mt-4 grid grid-cols-[7rem_minmax(0,1fr)] gap-y-2 text-sm">
        <dt className="text-muted">Catalogue</dt><dd className="font-medium">{c.name}</dd>
        <dt className="text-muted">Business</dt><dd><Link to={`/admin/businesses?business=${c.business_id}`} className="font-medium hover:text-brand-700">{c.business_name}</Link>{c.business_status !== 'active' && <span className="ml-1 text-xs text-red-600">(suspended)</span>}</dd>
        <dt className="text-muted">Status</dt><dd><StatusPill status={c.status} /></dd>
        <dt className="text-muted">Public link</dt><dd className="truncate">{c.public_url ? <a href={c.public_url} target="_blank" rel="noreferrer" className="text-brand-700 hover:underline">{c.public_url}</a> : <span className="text-muted">Not public ({c.status})</span>}</dd>
        <dt className="text-muted">Created</dt><dd>{formatDateTime(c.created_at)}</dd>
        <dt className="text-muted">Products</dt><dd className="tabular-nums">{c.product_count}</dd>
        <dt className="text-muted">Views</dt><dd className="tabular-nums">{c.view_count.toLocaleString()}</dd>
        <dt className="text-muted">Enquiries</dt><dd className="tabular-nums">{c.enquiry_count.toLocaleString()}</dd>
      </dl>
      {c.public_url && (
        <div className="mt-4 grid grid-cols-2 gap-2">
          <a href={c.public_url} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-canvas"><ExternalLink className="size-4" aria-hidden /> View Catalogue</a>
          <Button variant="secondary" icon={<Copy className="size-4" />} onClick={() => navigator.clipboard?.writeText(c.public_url!).then(() => toast.show('Link copied.'))}>Copy Link</Button>
          <Button variant="secondary" className="col-span-2" icon={<Download className="size-4" />} onClick={() => downloadAdminQr(c, 'png').catch(() => toast.show('Could not download the QR code.', 'error'))}>Download QR Code</Button>
        </div>
      )}
      {canManage && c.status === 'published' && (
        <div className="mt-4 border-t border-border pt-4">
          <Button variant="danger" className="w-full" icon={<ShieldOff className="size-4" />} onClick={() => { setError(null); setConfirm(true) }}>Take down (unpublish)</Button>
          <p className="mt-2 text-xs text-muted">Moderation only: the catalogue returns to draft, its content is kept and the business is notified with your reason. Admins can't edit or delete business content.</p>
        </div>
      )}
      {confirm && (
        <ReasonDialog title={`Take down “${c.name}”?`} description="The public link stops working immediately. The business can fix the issue and publish again."
          confirmLabel="Take down" loading={takedown.isPending} error={error} onClose={() => setConfirm(false)}
          onConfirm={(reason) => takedown.mutate({ id: c.id, reason }, {
            onSuccess: () => { toast.show('Catalogue unpublished.'); setConfirm(false) },
            onError: (e) => setError(e.message),
          })} />
      )}
      {c.public_url && <div className="mt-4 flex justify-center"><AdminQr catalogueId={c.id} alt={`QR code for ${c.name}`} className="size-32" /></div>}
    </aside>
  )
}

export function AdminCataloguesPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const openId = searchParams.get('catalogue')
  const [params, setParams] = useState({ page: 1, search: '', status: '', ordering: '-created_at' })
  const list = useAdminCatalogues({ ...params, page_size: 10 })
  const summary = useAdminCatalogueSummary()
  const s = summary.data
  const set = (patch: Partial<typeof params>) => setParams((p) => ({ ...p, page: 1, ...patch }))
  const rows = list.data?.results ?? []
  const open = rows.find((c) => c.id === openId) ?? null

  return (
    <RequirePlatformPermission code="platform.catalogue.view">
      <PageHero icon={BookOpen} title="Catalogues Management" description="All business catalogues across the platform. Drafts stay private — they have no public link." />
      <div className="mb-4 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 2xl:grid-cols-6">
        <StatCard icon={BookOpen} label="Total Catalogues" value={s?.total ?? '—'} loading={summary.isPending} hint={s && `+${s.new_this_month} this month`} />
        <StatCard icon={CircleCheck} tone="green" label="Live" value={s?.live ?? '—'} loading={summary.isPending} hint="Published, business active" />
        <StatCard icon={FilePen} tone="amber" label="Drafts" value={s?.draft ?? '—'} loading={summary.isPending} />
        <StatCard icon={Archive} tone="slate" label="Archived" value={s?.archived ?? '—'} loading={summary.isPending} />
        <StatCard icon={Plus} tone="pink" label="Published" value={s?.published ?? '—'} loading={summary.isPending} />
        <StatCard icon={Package} tone="violet" label="Total Products" value={s?.products.toLocaleString() ?? '—'} loading={summary.isPending} />
      </div>
      <div className={open ? 'grid gap-6 2xl:grid-cols-[minmax(0,1fr)_24rem]' : ''}>
        <div className="min-w-0">
          <Toolbar>
            <SearchInput value={params.search} onChange={(search) => set({ search })} placeholder="Search catalogue or business…" />
            <FilterSelect label="Status" value={params.status} onChange={(status) => set({ status })}
              options={[{ value: '', label: 'All status' }, { value: 'published', label: 'Published' }, { value: 'draft', label: 'Draft' }, { value: 'archived', label: 'Archived' }]} />
            <FilterSelect label="Sort" value={params.ordering} onChange={(ordering) => set({ ordering })}
              options={[{ value: '-created_at', label: 'Newest first' }, { value: '-view_count', label: 'Most views' }, { value: '-product_count', label: 'Most products' }, { value: 'name', label: 'Name A–Z' }]} />
          </Toolbar>
          {list.isPending ? <Spinner /> : list.isError ? <ErrorState error={list.error} onRetry={() => list.refetch()} /> : rows.length === 0 ? (
            <EmptyState icon={BookOpen} title={params.search || params.status ? 'No catalogues match your filters' : 'No catalogues yet'} />
          ) : (
            <div className="overflow-x-auto rounded-2xl bg-white shadow-panel">
              <table className="w-full text-left text-sm">
                <thead className="bg-thead text-[13px] font-semibold text-ink">
                  <tr>
                    <th scope="col" className="px-4 py-3">Catalogue</th>
                    <th scope="col" className="hidden px-3 py-3 md:table-cell">Business</th>
                    <th scope="col" className="hidden px-3 py-3 text-right sm:table-cell">Products</th>
                    <th scope="col" className="hidden px-3 py-3 text-right lg:table-cell">Views</th>
                    <th scope="col" className="px-3 py-3">Status</th>
                    <th scope="col" className="hidden px-3 py-3 xl:table-cell">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((c) => (
                    <tr key={c.id} onClick={() => setSearchParams({ catalogue: c.id })} className={cn('cursor-pointer hover:bg-canvas', openId === c.id && 'bg-brand-50/60')}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <MediaThumb media={c.cover} className="h-10 w-14 shrink-0 rounded-md" />
                          <div className="min-w-0">
                            <button type="button" onClick={() => setSearchParams({ catalogue: c.id })} className="block max-w-56 truncate text-left font-medium hover:text-brand-700">{c.name}</button>
                            <span className="block max-w-56 truncate text-xs text-muted">{c.public_url ?? `/${c.slug} (not public)`}</span>
                          </div>
                        </div>
                      </td>
                      <td className="hidden px-3 py-3 md:table-cell">{c.business_name}{c.business_status !== 'active' && <span className="block text-xs text-red-600">business suspended</span>}</td>
                      <td className="hidden px-3 py-3 text-right tabular-nums sm:table-cell">{c.product_count}</td>
                      <td className="hidden px-3 py-3 text-right tabular-nums lg:table-cell">{c.view_count.toLocaleString()}</td>
                      <td className="px-3 py-3"><StatusPill status={c.status} /></td>
                      <td className="hidden px-3 py-3 text-xs text-muted xl:table-cell">{formatDateTime(c.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {list.data && list.data.count > 0 && (
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
              <span>Showing {(list.data.page - 1) * list.data.page_size + 1} to {Math.min(list.data.page * list.data.page_size, list.data.count)} of {list.data.count} catalogues</span>
              <Pagination page={params.page} totalPages={list.data.total_pages} count={list.data.count} onPage={(page) => setParams((p) => ({ ...p, page }))} />
            </div>
          )}
        </div>
        {open && <div className="2xl:sticky 2xl:top-20 2xl:self-start"><CataloguePanel catalogue={open} onClose={() => setSearchParams({})} /></div>}
      </div>
    </RequirePlatformPermission>
  )
}
