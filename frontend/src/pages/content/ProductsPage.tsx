import heroArt from '@/assets/reference/hero-products.webp'
import { Archive, ArchiveRestore, Box, Copy, Eye, EyeOff, FileText, MessageSquare, Package, Pencil, Plus, Send, Star, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  useAllCategories,
  useBulkProducts,
  useCatalogues,
  useProductAction,
  useProducts,
  useProductSummary,
  type BulkAction,
  type ProductAction,
} from '@/api/content'
import { ActionMenu, type MenuItem } from '@/components/panel/ActionMenu'
import { PageHero } from '@/components/panel/PageHero'
import { PlanLimitAlert } from '@/components/panel/PlanLimitAlert'
import { StatCard, StatGrid } from '@/components/panel/StatCard'
import { StatusPill } from '@/components/panel/StatusPill'
import { FilterSelect, SearchInput, Toolbar, ViewToggle, type ViewMode } from '@/components/panel/Toolbar'
import { Button } from '@/components/ui/Button'
import { buttonClasses, chipTone, rowIconButton } from '@/components/ui/buttonStyles'
import { EmptyState, ErrorState, Spinner } from '@/components/ui/Feedback'
import { ConfirmDialog, Modal } from '@/components/ui/Modal'
import { Pagination } from '@/components/ui/Pagination'
import { useToast } from '@/components/ui/toast'
import { useActiveBusiness } from '@/features/business/BusinessContext'
import { formatDate, formatPrice, isPlanError } from '@/features/content/format'
import { MediaThumb } from '@/features/content/MediaThumb'
import { RequirePermission } from '@/routes/guards'
import type { ProductListItem } from '@/types/content'
import { cn } from '@/utils/cn'

const SORT_OPTIONS = [
  { value: '-created_at', label: 'Sort: Newest' },
  { value: 'created_at', label: 'Sort: Oldest' },
  { value: '-updated_at', label: 'Sort: Recently updated' },
  { value: 'name', label: 'Sort: Name A–Z' },
  { value: 'price', label: 'Sort: Price low–high' },
  { value: '-price', label: 'Sort: Price high–low' },
  { value: '-view_count', label: 'Sort: Most viewed' },
  { value: '-enquiry_count', label: 'Sort: Most enquiries' },
]

const BULK: { action: BulkAction; label: string; needs: string[]; danger?: boolean; needsCatalogue?: boolean }[] = [
  { action: 'publish', label: 'Publish', needs: ['product.publish'] },
  { action: 'unpublish', label: 'Unpublish', needs: ['product.publish'] },
  { action: 'add_to_catalogue', label: 'Add to catalogue…', needs: ['product.update', 'catalogue.update'], needsCatalogue: true },
  { action: 'remove_from_catalogue', label: 'Remove from catalogue…', needs: ['product.update', 'catalogue.update'], needsCatalogue: true },
  { action: 'archive', label: 'Archive', needs: ['product.update'] },
  { action: 'restore', label: 'Restore', needs: ['product.update'] },
  { action: 'delete', label: 'Delete', needs: ['product.delete'], danger: true },
]

function CatalogueThumbs({ product }: { product: ProductListItem }) {
  if (product.catalogues.length === 0) return <span className="text-xs text-muted">—</span>
  const shown = product.catalogues.slice(0, 2)
  return (
    <span className="flex items-center gap-1" title={product.catalogues.map((c) => c.name).join(', ')}>
      {shown.map((c) => (
        <span key={c.id} className="size-7 overflow-hidden rounded-md bg-slate-100 ring-1 ring-white">
          {c.cover_thumbnail_url ? <img src={c.cover_thumbnail_url} alt={c.name} className="size-full object-cover" /> : <span className="flex size-full items-center justify-center text-[10px] font-semibold text-muted">{c.name[0]}</span>}
        </span>
      ))}
      {product.catalogues.length > 2 && <span className="text-xs text-muted">+{product.catalogues.length - 2}</span>}
    </span>
  )
}

export function ProductsPage() {
  const { businessId, can } = useActiveBusiness()
  const navigate = useNavigate()
  const toast = useToast()
  const [params, setParams] = useState({ page: 1, search: '', status: '', category: '', catalogue: '', ordering: '-created_at' })
  const [view, setView] = useState<ViewMode>('list')
  const [selected, setSelected] = useState<string[]>([])
  const [bulk, setBulk] = useState<(typeof BULK)[number] | null>(null)
  const [bulkCatalogue, setBulkCatalogue] = useState('')
  const [deleting, setDeleting] = useState<ProductListItem | null>(null)
  const list = useProducts(businessId, { ...params, page_size: 10 })
  const summary = useProductSummary(businessId)
  const categories = useAllCategories(businessId)
  const catalogues = useCatalogues(businessId, { page_size: 100, ordering: 'name' })
  const act = useProductAction()
  const runBulk = useBulkProducts()

  const set = (patch: Partial<typeof params>) => {
    setSelected([])
    setParams((p) => ({ ...p, page: 1, ...patch }))
  }

  const single = (p: ProductListItem, action: ProductAction) =>
    act.mutate(
      { id: p.id, action },
      {
        onSuccess: (result) => {
          setDeleting(null)
          toast.show(
            { publish: 'Product published.', unpublish: 'Product moved to drafts.', archive: 'Product archived.', restore: 'Product restored as a draft.', duplicate: 'Product duplicated as a draft.', delete: 'Product deleted.' }[action],
          )
          if (action === 'duplicate' && result) navigate(`/app/products/${result.id}`)
        },
        onError: (e) => {
          setDeleting(null)
          if (!isPlanError(e)) toast.show(e.message, 'error')
        },
      },
    )

  const menu = (p: ProductListItem): MenuItem[] => [
    { label: 'Publish', icon: Send, onSelect: () => single(p, 'publish'), hidden: p.status === 'published' || !can('product.publish') },
    { label: 'Unpublish', icon: EyeOff, onSelect: () => single(p, 'unpublish'), hidden: p.status !== 'published' || !can('product.publish') },
    { label: 'Duplicate', icon: Copy, onSelect: () => single(p, 'duplicate'), hidden: !can('product.create') },
    { label: 'Archive', icon: Archive, onSelect: () => single(p, 'archive'), hidden: p.status === 'archived' || !can('product.update') },
    { label: 'Restore', icon: ArchiveRestore, onSelect: () => single(p, 'restore'), hidden: p.status !== 'archived' || !can('product.update') },
    { label: 'Delete', icon: Trash2, danger: true, onSelect: () => setDeleting(p), hidden: !can('product.delete') },
  ]

  const rows = list.data?.results ?? []
  const allSelected = rows.length > 0 && rows.every((r) => selected.includes(r.id))
  const bulkOptions = BULK.filter((b) => b.needs.every((code) => can(code)))
  const limit = summary.data?.limit

  return (
    <RequirePermission codes={['product.view']}>
      <PageHero
        icon={Box}
        title="Products"
        description="Add, manage and organise your products. Upload high-quality images, videos and details to showcase them in your catalogues."
        illustration={heroArt}
        highlights={['Add high-quality photos & videos', 'Organise with categories', 'Set price, MOQ and details', 'Assign to multiple catalogues']}
        action={
          can('product.create') && (
            <Link to="/app/products/new" className={buttonClasses('primary', 'lg')}>
              <Plus className="size-5" aria-hidden /> Add Product
            </Link>
          )
        }
      />
      <StatGrid>
        <StatCard icon={Package} tone="pink" label="Total products" value={summary.data?.total ?? '—'} loading={summary.isPending}
          hint={limit != null ? `${(summary.data?.total ?? 0) - (summary.data?.archived ?? 0)} of ${limit} active allowed` : undefined} />
        <StatCard icon={Eye} tone="green" label="Published" value={summary.data?.published ?? '—'} loading={summary.isPending} />
        <StatCard icon={FileText} tone="amber" label="Drafts" value={summary.data?.draft ?? '—'} loading={summary.isPending} />
        <StatCard icon={Archive} tone="violet" label="Archived" value={summary.data?.archived ?? '—'} loading={summary.isPending} />
      </StatGrid>

      <PlanLimitAlert error={act.error ?? runBulk.error} className="mb-4" />

      <Toolbar
        end={
          <>
            <ViewToggle value={view} onChange={setView} />
            {bulkOptions.length > 0 && (
              <select
                aria-label="Bulk actions"
                value=""
                disabled={selected.length === 0}
                onChange={(e) => {
                  const choice = BULK.find((b) => b.action === e.target.value)
                  if (choice) setBulk(choice)
                }}
                className="h-10 w-[140px] rounded-lg border border-[#d5e5fa] bg-white px-3 text-sm font-semibold text-ink disabled:opacity-60"
              >
                <option value="">Bulk actions{selected.length ? ` (${selected.length})` : ''}</option>
                {bulkOptions.map((b) => (
                  <option key={b.action} value={b.action}>{b.label}</option>
                ))}
              </select>
            )}
          </>
        }
      >
        <SearchInput value={params.search} onChange={(search) => set({ search })} placeholder="Search products by name, SKU…" />
        <FilterSelect label="Catalogue" value={params.catalogue} onChange={(catalogue) => set({ catalogue })}
          options={[{ value: '', label: 'All catalogues' }, ...(catalogues.data?.results ?? []).map((c) => ({ value: c.id, label: c.name }))]} />
        <FilterSelect label="Category" value={params.category} onChange={(category) => set({ category })}
          options={[{ value: '', label: 'All categories' }, ...(categories.data?.results ?? []).map((c) => ({ value: c.id, label: c.path.join(' › ') }))]} />
        <FilterSelect label="Status" value={params.status} onChange={(status) => set({ status })}
          options={[{ value: '', label: 'All status' }, { value: 'published', label: 'Published' }, { value: 'draft', label: 'Draft' }, { value: 'archived', label: 'Archived' }]} />
        <FilterSelect label="Sort" value={params.ordering} onChange={(ordering) => set({ ordering })} options={SORT_OPTIONS} />
      </Toolbar>

      {list.isPending ? (
        <Spinner label="Loading products…" />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Box}
          title={params.search || params.status || params.category || params.catalogue ? 'No products match your filters' : 'No products yet'}
          description="Products hold your photos, videos, prices and details. Add them to one or more catalogues."
          action={can('product.create') && !params.search && (
            <Link to="/app/products/new" className={buttonClasses('primary', 'md')}><Plus className="size-4" aria-hidden /> Add your first product</Link>
          )}
        />
      ) : view === 'list' ? (
        <div className="overflow-x-auto rounded-2xl bg-white shadow-panel">
          <table className="w-full text-left text-sm">
            <thead className="bg-thead text-[13px] font-semibold text-ink">
              <tr>
                <th scope="col" className="w-10 px-4 py-3">
                  <input type="checkbox" aria-label="Select all on this page" className="size-4 accent-brand-700" checked={allSelected}
                    onChange={(e) => setSelected(e.target.checked ? rows.map((r) => r.id) : [])} />
                </th>
                <th scope="col" className="px-3 py-3">Product</th>
                <th scope="col" className="px-3 py-3">Category</th>
                <th scope="col" className="px-3 py-3">Price</th>
                <th scope="col" className="hidden px-3 py-3 lg:table-cell">MOQ</th>
                <th scope="col" className="hidden px-3 py-3 md:table-cell">Catalogues</th>
                <th scope="col" className="hidden px-3 py-3 text-right lg:table-cell">Views</th>
                <th scope="col" className="hidden px-3 py-3 text-right lg:table-cell">Enquiries</th>
                <th scope="col" className="px-3 py-3">Status</th>
                <th scope="col" className="hidden px-3 py-3 xl:table-cell">Created</th>
                <th scope="col" className="px-3 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((p) => (
                <tr key={p.id} className={selected.includes(p.id) ? 'bg-brand-50/50' : undefined}>
                  <td className="px-4 py-1.5">
                    <input type="checkbox" aria-label={`Select ${p.name}`} className="size-4 accent-brand-700" checked={selected.includes(p.id)}
                      onChange={(e) => setSelected((cur) => (e.target.checked ? [...cur, p.id] : cur.filter((id) => id !== p.id)))} />
                  </td>
                  <td className="px-3 py-1.5">
                    <Link to={`/app/products/${p.id}`} className="flex items-center gap-3">
                      <MediaThumb media={p.thumbnail} alt={p.name} className="size-12 shrink-0 rounded-lg" />
                      <span className="min-w-0">
                        <span className="flex items-center gap-1 font-medium hover:text-brand-700">
                          <span className="truncate">{p.name}</span>
                          {p.is_featured && <Star className="size-3.5 shrink-0 fill-amber-400 text-amber-400" aria-label="Featured" />}
                        </span>
                        {p.sku && <span className="block text-xs text-muted">SKU: {p.sku}</span>}
                      </span>
                    </Link>
                  </td>
                  <td className="px-3 py-1.5"><span className={cn('rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap', chipTone(p.category.name))}>{p.category.name}</span></td>
                  <td className="px-3 py-1.5 font-medium whitespace-nowrap tabular-nums">{formatPrice(p.price, p.currency) ?? <span className="font-normal text-muted">On request</span>}</td>
                  <td className="hidden px-3 py-1.5 tabular-nums lg:table-cell">{p.moq ?? '—'}</td>
                  <td className="hidden px-3 py-1.5 md:table-cell"><CatalogueThumbs product={p} /></td>
                  <td className="hidden px-3 py-1.5 whitespace-nowrap tabular-nums lg:table-cell">
                    <span className="inline-flex items-center gap-1.5"><Eye className="size-4" aria-hidden /> {p.view_count.toLocaleString()}</span>
                  </td>
                  <td className="hidden px-3 py-1.5 whitespace-nowrap tabular-nums lg:table-cell">
                    <span className="inline-flex items-center gap-1.5"><MessageSquare className="size-4" aria-hidden /> {p.enquiry_count.toLocaleString()}</span>
                  </td>
                  <td className="px-3 py-1.5"><StatusPill status={p.status} /></td>
                  <td className="hidden px-3 py-1.5 whitespace-nowrap xl:table-cell">{formatDate(p.created_at)}</td>
                  <td className="px-3 py-1.5">
                    <div className="flex justify-end gap-1.5">
                      <Link to={`/app/products/${p.id}`} className={rowIconButton} aria-label={`Edit ${p.name}`} title="Edit">
                        <Pencil className="size-4" fill="currentColor" fillOpacity={0.2} />
                      </Link>
                      <ActionMenu items={menu(p)} tint />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {rows.map((p) => (
            <li key={p.id} className="overflow-hidden rounded-2xl bg-white shadow-panel">
              <div className="relative">
                <Link to={`/app/products/${p.id}`}><MediaThumb media={p.thumbnail} alt={p.name} className="aspect-square w-full" /></Link>
                <StatusPill status={p.status} className="absolute top-3 left-3" />
                <ActionMenu items={menu(p)} className="absolute top-3 right-3" />
                <input type="checkbox" aria-label={`Select ${p.name}`} className="absolute bottom-3 left-3 size-4 accent-brand-700" checked={selected.includes(p.id)}
                  onChange={(e) => setSelected((cur) => (e.target.checked ? [...cur, p.id] : cur.filter((id) => id !== p.id)))} />
              </div>
              <Link to={`/app/products/${p.id}`} className="block p-3">
                <p className="truncate font-medium">{p.name}</p>
                <p className="text-xs text-muted">{p.category.name}</p>
                <p className="mt-1 text-sm font-semibold">{formatPrice(p.price, p.currency) ?? <span className="font-normal text-muted">Price on request</span>}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {list.data && list.data.count > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 px-1 text-sm text-ink">
          <span>Showing {(list.data.page - 1) * list.data.page_size + 1} to {Math.min(list.data.page * list.data.page_size, list.data.count)} of {list.data.count} products</span>
          <Pagination page={params.page} totalPages={list.data.total_pages} count={list.data.count} onPage={(page) => { setSelected([]); setParams((p) => ({ ...p, page })) }} />
        </div>
      )}

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && single(deleting, 'delete')}
        loading={act.isPending}
        title={`Delete “${deleting?.name}”?`}
        description="The product is removed from every catalogue. Its images stay in your media library. This cannot be undone — archive instead to hide it temporarily."
        confirmLabel="Delete product"
      />
      <Modal
        open={bulk !== null}
        onClose={() => setBulk(null)}
        title={`${bulk?.label.replace('…', '')} — ${selected.length} product(s)`}
        description={bulk?.action === 'delete' ? 'Selected products are permanently deleted. This cannot be undone.' : undefined}
        footer={
          <>
            <Button variant="secondary" onClick={() => setBulk(null)}>Cancel</Button>
            <Button
              variant={bulk?.danger ? 'danger' : 'primary'}
              loading={runBulk.isPending}
              disabled={Boolean(bulk?.needsCatalogue) && !bulkCatalogue}
              onClick={() =>
                bulk &&
                runBulk.mutate(
                  { ids: selected, action: bulk.action, catalogue_id: bulk.needsCatalogue ? bulkCatalogue : undefined },
                  {
                    onSuccess: (r) => { toast.show(`${r.updated} product(s) updated.`); setSelected([]); setBulk(null) },
                    onError: (e) => { setBulk(null); if (!isPlanError(e)) toast.show(e.message, 'error') },
                  },
                )
              }
            >
              Confirm
            </Button>
          </>
        }
      >
        {bulk?.needsCatalogue && (
          <FilterSelect label="Catalogue" value={bulkCatalogue} onChange={setBulkCatalogue}
            options={[{ value: '', label: 'Choose a catalogue' }, ...(catalogues.data?.results ?? []).map((c) => ({ value: c.id, label: c.name }))]} />
        )}
      </Modal>
    </RequirePermission>
  )
}
