import heroArt from '@/assets/reference/hero-catalogues.webp'
import { Archive, ArchiveRestore, BookOpen, Copy, Eye, EyeOff, FilePen, FileText, MessagesSquare, Package, Pencil, Plus, Send, Share2, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAllCategories, useCatalogueAction, useCatalogues, useCatalogueSummary } from '@/api/content'
import { ActionMenu, type MenuItem } from '@/components/panel/ActionMenu'
import { PageHero } from '@/components/panel/PageHero'
import { PlanLimitAlert } from '@/components/panel/PlanLimitAlert'
import { StatCard, StatGrid } from '@/components/panel/StatCard'
import { StatusPill } from '@/components/panel/StatusPill'
import { FilterSelect, SearchInput, Toolbar, ViewToggle, type ViewMode } from '@/components/panel/Toolbar'
import { Button } from '@/components/ui/Button'
import { buttonClasses } from '@/components/ui/buttonStyles'
import { EmptyState, ErrorState, Spinner } from '@/components/ui/Feedback'
import { ConfirmDialog } from '@/components/ui/Modal'
import { Pagination } from '@/components/ui/Pagination'
import { useToast } from '@/components/ui/toast'
import { useActiveBusiness } from '@/features/business/BusinessContext'
import { formatDate, isPlanError } from '@/features/content/format'
import { MediaThumb } from '@/features/content/MediaThumb'
import { ShareCatalogueModal } from '@/features/content/ShareCatalogueModal'
import { RequirePermission } from '@/routes/guards'
import type { Catalogue } from '@/types/content'

const STATUS_OPTIONS = [
  { value: '', label: 'All status' },
  { value: 'published', label: 'Published' },
  { value: 'draft', label: 'Draft' },
  { value: 'archived', label: 'Archived' },
]
const SORT_OPTIONS = [
  { value: '-created_at', label: 'Sort: Newest first' },
  { value: 'created_at', label: 'Sort: Oldest first' },
  { value: '-updated_at', label: 'Sort: Recently updated' },
  { value: 'name', label: 'Sort: Name A–Z' },
  { value: '-product_count', label: 'Sort: Most products' },
  { value: '-view_count', label: 'Sort: Most views' },
  { value: '-enquiry_count', label: 'Sort: Most enquiries' },
]

type Pending = { catalogue: Catalogue; action: 'archive' | 'delete' } | null

export function CataloguesPage() {
  const { businessId, can } = useActiveBusiness()
  const navigate = useNavigate()
  const toast = useToast()
  const [params, setParams] = useState({ page: 1, search: '', status: '', category: '', ordering: '-created_at' })
  const [view, setView] = useState<ViewMode>('grid')
  const [sharing, setSharing] = useState<Catalogue | null>(null)
  const [pending, setPending] = useState<Pending>(null)
  const list = useCatalogues(businessId, { ...params, page_size: 12 })
  const summary = useCatalogueSummary(businessId)
  const categories = useAllCategories(businessId)
  const act = useCatalogueAction()

  const set = (patch: Partial<typeof params>) => setParams((p) => ({ ...p, page: 1, ...patch }))

  const run = (catalogue: Catalogue, action: 'publish' | 'unpublish' | 'archive' | 'restore' | 'delete') =>
    act.mutate(
      { id: catalogue.id, action },
      {
        onSuccess: () => {
          setPending(null)
          toast.show(
            { publish: 'Catalogue published.', unpublish: 'Catalogue unpublished.', archive: 'Catalogue archived.', restore: 'Catalogue restored as a draft.', delete: 'Catalogue deleted.' }[action],
          )
        },
        onError: (e) => {
          setPending(null)
          if (!isPlanError(e)) toast.show(e.message, 'error')
        },
      },
    )

  const menu = (c: Catalogue): MenuItem[] => [
    { label: 'Publish', icon: Send, onSelect: () => run(c, 'publish'), hidden: c.status !== 'draft' || !can('catalogue.publish') },
    { label: 'Unpublish', icon: EyeOff, onSelect: () => run(c, 'unpublish'), hidden: c.status !== 'published' || !can('catalogue.publish') },
    { label: 'Copy link', icon: Copy, onSelect: () => navigator.clipboard?.writeText(c.public_url).then(() => toast.show('Link copied.')) },
    { label: 'Archive', icon: Archive, onSelect: () => setPending({ catalogue: c, action: 'archive' }), hidden: c.status === 'archived' || !can('catalogue.update') },
    { label: 'Restore', icon: ArchiveRestore, onSelect: () => run(c, 'restore'), hidden: c.status !== 'archived' || !can('catalogue.update') },
    { label: 'Delete', icon: Trash2, danger: true, onSelect: () => setPending({ catalogue: c, action: 'delete' }), hidden: !can('catalogue.delete') },
  ]

  const limit = summary.data?.limit
  return (
    <RequirePermission codes={['catalogue.view']}>
      <PageHero
        icon={BookOpen}
        title="Catalogues"
        description="Create, manage and share your product catalogues with your customers. Build beautiful catalogues and grow your business."
        illustration={heroArt}
        highlights={['Create multiple catalogues', 'Share with a single link', 'Customise with your brand', 'Arrange products your way']}
        action={
          can('catalogue.create') && (
            <Link to="/app/catalogues/new" className={buttonClasses('primary', 'lg')}>
              <Plus className="size-5" aria-hidden /> Create Catalogue
            </Link>
          )
        }
      />
      <StatGrid>
        <StatCard icon={BookOpen} label="Total catalogues" value={summary.data?.total ?? '—'} loading={summary.isPending}
          hint={limit != null ? `${(summary.data?.total ?? 0) - (summary.data?.archived ?? 0)} of ${limit} active allowed` : undefined} />
        <StatCard icon={Package} tone="pink" label="Published" value={summary.data?.published ?? '—'} loading={summary.isPending} />
        <StatCard icon={FileText} tone="violet" label="Drafts" value={summary.data?.draft ?? '—'} loading={summary.isPending} />
        <StatCard icon={Archive} tone="slate" label="Archived" value={summary.data?.archived ?? '—'} loading={summary.isPending} />
      </StatGrid>

      <PlanLimitAlert error={act.error} className="mb-4" />

      <Toolbar end={<ViewToggle value={view} onChange={setView} />}>
        <SearchInput value={params.search} onChange={(search) => set({ search })} placeholder="Search catalogues…" />
        <FilterSelect label="Status" value={params.status} onChange={(status) => set({ status })} options={STATUS_OPTIONS} />
        <FilterSelect
          label="Category"
          value={params.category}
          onChange={(category) => set({ category })}
          options={[{ value: '', label: 'All categories' }, ...(categories.data?.results ?? []).map((c) => ({ value: c.id, label: c.path.join(' › ') }))]}
        />
        <FilterSelect label="Sort" value={params.ordering} onChange={(ordering) => set({ ordering })} options={SORT_OPTIONS} />
      </Toolbar>

      {list.isPending ? (
        <Spinner label="Loading catalogues…" />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : list.data.results.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title={params.search || params.status || params.category ? 'No catalogues match your filters' : 'No catalogues yet'}
          description="Group products into catalogues you can share with a single link."
          action={
            can('catalogue.create') && !params.search && (
              <Link to="/app/catalogues/new" className={buttonClasses('primary', 'md')}>
                <Plus className="size-4" aria-hidden /> Create your first catalogue
              </Link>
            )
          }
        />
      ) : view === 'grid' ? (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {list.data.results.map((c) => (
            <li key={c.id} className="flex flex-col rounded-2xl bg-white p-2.5 shadow-panel">
              <div className="relative">
                <MediaThumb media={c.cover} alt={c.name} className="h-[100px] w-full rounded-lg" />
                <StatusPill status={c.status} className="absolute top-2 left-2" />
                <ActionMenu items={menu(c)} className="absolute top-2 right-2" />
              </div>
              <div className="flex flex-1 flex-col px-1.5 pt-3 pb-1">
                <h2 className="truncate text-[16px] font-bold text-ink">{c.name}</h2>
                <p className="mt-0.5 line-clamp-1 text-[13px] text-body">{c.tagline || c.description || 'No description'}</p>
                <p className="mt-3 flex items-center gap-x-3.5 overflow-hidden text-[12px] whitespace-nowrap text-ink">
                  <span className="inline-flex items-center gap-1" title={`${c.published_product_count} visible in the public catalogue`}>
                    <Package className="size-3.5" aria-hidden /> {c.product_count} Products
                  </span>
                  <span className="inline-flex items-center gap-1"><Eye className="size-3.5" aria-hidden /> {c.view_count.toLocaleString()} Views</span>
                  <span className="inline-flex items-center gap-1"><MessagesSquare className="size-3.5" aria-hidden /> {c.enquiry_count.toLocaleString()} Enquiries</span>
                </p>
                <div className="mt-3.5 grid grid-cols-3 gap-2">
                  <Button variant="soft" size="md" icon={<Pencil className="size-4" />} onClick={() => navigate(`/app/catalogues/${c.id}`)}>
                    {can('catalogue.update') ? 'Edit' : 'Open'}
                  </Button>
                  {c.status === 'published' ? (
                    <a href={c.public_url} target="_blank" rel="noreferrer" className={buttonClasses('soft', 'md')}>
                      <Eye className="size-4" aria-hidden /> View
                    </a>
                  ) : (
                    <Button variant="soft" size="md" disabled title="Publish to view publicly" icon={<Eye className="size-4" />}>View</Button>
                  )}
                  <Button variant="soft" size="md" icon={<Share2 className="size-4" />} onClick={() => setSharing(c)}>
                    Share
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="overflow-x-auto rounded-2xl bg-white shadow-panel">
          <table className="w-full text-left text-sm">
            <thead className="bg-thead text-[13px] font-semibold text-ink">
              <tr>
                <th scope="col" className="px-4 py-3">Catalogue</th>
                <th scope="col" className="px-4 py-3">Products</th>
                <th scope="col" className="hidden px-4 py-3 sm:table-cell">Views</th>
                <th scope="col" className="hidden px-4 py-3 sm:table-cell">Enquiries</th>
                <th scope="col" className="px-4 py-3">Status</th>
                <th scope="col" className="hidden px-4 py-3 md:table-cell">Created</th>
                <th scope="col" className="hidden px-4 py-3 md:table-cell">Updated</th>
                <th scope="col" className="px-4 py-3"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {list.data.results.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-3">
                    <Link to={`/app/catalogues/${c.id}`} className="flex items-center gap-3">
                      <MediaThumb media={c.cover} className="h-10 w-14 shrink-0 rounded-md" />
                      <span className="min-w-0">
                        <span className="block truncate font-medium hover:text-brand-700">{c.name}</span>
                        <span className="block truncate text-xs text-muted">/{c.slug}</span>
                      </span>
                    </Link>
                  </td>
                  <td className="px-4 py-3 tabular-nums">{c.product_count}</td>
                  <td className="hidden px-4 py-3 tabular-nums sm:table-cell">{c.view_count.toLocaleString()}</td>
                  <td className="hidden px-4 py-3 tabular-nums sm:table-cell">{c.enquiry_count.toLocaleString()}</td>
                  <td className="px-4 py-3"><StatusPill status={c.status} /></td>
                  <td className="hidden px-4 py-3 text-muted md:table-cell">{formatDate(c.created_at)}</td>
                  <td className="hidden px-4 py-3 text-muted md:table-cell">{formatDate(c.updated_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" aria-label={`Share ${c.name}`} icon={<Share2 className="size-4" />} onClick={() => setSharing(c)} />
                      <Button variant="ghost" size="sm" aria-label={`Edit ${c.name}`} icon={<FilePen className="size-4" />} onClick={() => navigate(`/app/catalogues/${c.id}`)} />
                      <ActionMenu items={menu(c)} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {list.data && list.data.count > 0 && (
        <div className="mt-4 flex items-center justify-between px-1 text-sm text-ink">
          <span>
            Showing {(list.data.page - 1) * list.data.page_size + 1} to {Math.min(list.data.page * list.data.page_size, list.data.count)} of {list.data.count} catalogues
          </span>
          <Pagination page={params.page} totalPages={list.data.total_pages} count={list.data.count} onPage={(page) => setParams((p) => ({ ...p, page }))} />
        </div>
      )}

      <ShareCatalogueModal catalogue={sharing} onClose={() => setSharing(null)} />
      <ConfirmDialog
        open={pending !== null}
        onClose={() => setPending(null)}
        onConfirm={() => pending && run(pending.catalogue, pending.action)}
        loading={act.isPending}
        title={pending?.action === 'delete' ? `Delete “${pending.catalogue.name}”?` : `Archive “${pending?.catalogue.name}”?`}
        description={
          pending?.action === 'delete'
            ? 'This permanently deletes the catalogue and its public link. Products themselves are kept. This cannot be undone.'
            : 'The catalogue goes offline and stops counting towards your plan. You can restore it later.'
        }
        confirmLabel={pending?.action === 'delete' ? 'Delete catalogue' : 'Archive'}
      />
    </RequirePermission>
  )
}
