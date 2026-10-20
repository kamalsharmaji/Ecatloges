import heroArt from '@/assets/reference/hero-categories.webp'
import { zodResolver } from '@hookform/resolvers/zod'
import { Folder, FolderTree, Network, Package, Pencil, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { useAllCategories, useCategories, useCategorySummary, useDeleteCategory, useSaveCategory } from '@/api/content'
import { ApiError } from '@/api/client'
import { ActionMenu } from '@/components/panel/ActionMenu'
import { PageHero } from '@/components/panel/PageHero'
import { PlanLimitAlert } from '@/components/panel/PlanLimitAlert'
import { StatCard, StatGrid } from '@/components/panel/StatCard'
import { StatusPill } from '@/components/panel/StatusPill'
import { FilterSelect, SearchInput, Toolbar } from '@/components/panel/Toolbar'
import { Button } from '@/components/ui/Button'
import { chipTone } from '@/components/ui/buttonStyles'
import { Alert, EmptyState, ErrorState, Spinner } from '@/components/ui/Feedback'
import { SelectField, TextAreaField, TextField } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { Pagination } from '@/components/ui/Pagination'
import { useToast } from '@/components/ui/toast'
import { useActiveBusiness } from '@/features/business/BusinessContext'
import { CATEGORY_ICONS, iconFor } from '@/features/content/categoryIcons'
import { isPlanError } from '@/features/content/format'
import { ImagePickerField } from '@/features/content/ImagePickerField'
import { MediaThumb } from '@/features/content/MediaThumb'
import { RequirePermission } from '@/routes/guards'
import type { Category, MediaBrief } from '@/types/content'
import { cn } from '@/utils/cn'
import { applyApiErrors } from '@/utils/formErrors'

const schema = z.object({
  name: z.string().trim().min(1, 'Enter a category name.').max(100),
  description: z.string().max(500),
  icon: z.string(),
  parent_id: z.string(),
  status: z.enum(['published', 'draft']),
})
type FormValues = z.infer<typeof schema>

function CategoryPanel({ category, onClose }: { category: Category | null; onClose: () => void }) {
  const { businessId } = useActiveBusiness()
  const toast = useToast()
  const all = useAllCategories(businessId)
  const save = useSaveCategory()
  const [image, setImage] = useState<MediaBrief | null>(category?.image ?? null)
  const [formError, setFormError] = useState<string | null>(null)
  const values = (c: Category | null): FormValues => ({
    name: c?.name ?? '',
    description: c?.description ?? '',
    icon: c?.icon ?? 'folder',
    parent_id: c?.parent?.id ?? '',
    status: c?.status ?? 'published',
  })
  const { register, control, handleSubmit, setError, reset, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: values(category),
  })
  useEffect(() => {
    reset(values(category))
    setImage(category?.image ?? null)
    setFormError(null)
  }, [category, reset])

  const onSubmit = handleSubmit(async (v) => {
    setFormError(null)
    try {
      await save.mutateAsync({ id: category?.id, ...v, parent_id: v.parent_id || null, image_id: image?.id ?? null })
      toast.show(category ? 'Category updated.' : 'Category created.')
      if (!category) {
        reset(values(null))
        setImage(null)
      } else onClose()
    } catch (error) {
      if (!isPlanError(error)) setFormError(applyApiErrors(error, setError, ['name', 'description', 'icon', 'parent_id', 'status'], { image_id: 'name' }))
    }
  })

  // A category can't be its own parent (the server also prevents deeper cycles).
  const parents = (all.data?.results ?? []).filter((c) => c.id !== category?.id && c.path.length < 3)

  return (
    <form onSubmit={onSubmit} noValidate className="rounded-2xl bg-white p-5 shadow-panel">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-[17px] font-bold text-ink">{category ? `Edit “${category.name}”` : 'Create New Category'}</h2>
        {category && (
          <button type="button" onClick={onClose} aria-label="Cancel editing" className="rounded p-1 text-muted hover:bg-canvas"><X className="size-5" /></button>
        )}
      </div>
      <fieldset disabled={isSubmitting} className="space-y-4">
        <PlanLimitAlert error={save.error} />
        {formError && <Alert tone="error">{formError}</Alert>}
        <TextField label="Category name" required placeholder="Enter category name" error={errors.name?.message} {...register('name')} />
        <TextAreaField label="Description" placeholder="Enter category description" error={errors.description?.message} {...register('description')} />
        <ImagePickerField label="Category image" value={image} onChange={setImage} folder="category_icons" hint="JPG, PNG or WebP" />
        <Controller
          control={control}
          name="icon"
          render={({ field }) => (
            <fieldset>
              <legend className="mb-1.5 text-sm font-medium">Icon</legend>
              <div className="flex flex-wrap gap-2">
                {Object.entries(CATEGORY_ICONS).map(([key, Icon]) => (
                  <button key={key} type="button" aria-label={key} aria-pressed={field.value === key} onClick={() => field.onChange(key)}
                    className={cn('flex size-9 items-center justify-center rounded-lg border', field.value === key ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-border text-muted hover:text-ink')}>
                    <Icon className="size-4" />
                  </button>
                ))}
              </div>
            </fieldset>
          )}
        />
        <SelectField label="Parent category" error={errors.parent_id?.message} {...register('parent_id')}>
          <option value="">None (top-level)</option>
          {parents.map((c) => <option key={c.id} value={c.id}>{c.path.join(' › ')}</option>)}
        </SelectField>
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">Status</legend>
          <div className="flex gap-5 text-sm">
            <label className="flex items-center gap-2"><input type="radio" value="published" className="size-4 accent-brand-700" {...register('status')} /> Published</label>
            <label className="flex items-center gap-2"><input type="radio" value="draft" className="size-4 accent-brand-700" {...register('status')} /> Draft</label>
          </div>
          <p className="mt-1 text-xs text-muted">Draft categories are hidden from public catalogue navigation.</p>
        </fieldset>
        <div className="grid grid-cols-2 gap-2 pt-2">
          <Button variant="secondary" onClick={() => (category ? onClose() : (reset(values(null)), setImage(null)))}>Cancel</Button>
          <Button type="submit" loading={isSubmitting}>{category ? 'Save Category' : 'Create Category'}</Button>
        </div>
      </fieldset>
    </form>
  )
}

function DeleteCategoryModal({ category, onClose }: { category: Category | null; onClose: () => void }) {
  const { businessId } = useActiveBusiness()
  const toast = useToast()
  const all = useAllCategories(businessId)
  const del = useDeleteCategory()
  const [target, setTarget] = useState('')
  if (!category) return null
  const needsTarget = category.product_count > 0
  const blocked = category.children_count > 0
  return (
    <Modal
      open
      onClose={() => { del.reset(); onClose() }}
      title={`Delete “${category.name}”?`}
      description={blocked ? undefined : 'This cannot be undone.'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="danger" loading={del.isPending} disabled={blocked || (needsTarget && !target)}
            onClick={() => del.mutate({ id: category.id, reassignTo: target || undefined }, {
              onSuccess: () => { toast.show('Category deleted.'); onClose() },
            })}>
            Delete category
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {blocked && <Alert tone="warning">This category has {category.children_count} subcategories. Move or delete them first.</Alert>}
        {needsTarget && !blocked && (
          <>
            <p className="text-sm">{category.product_count} product(s) use this category. Choose where to move them:</p>
            <FilterSelect label="Move products to" value={target} onChange={setTarget}
              options={[{ value: '', label: 'Choose a category' }, ...(all.data?.results ?? []).filter((c) => c.id !== category.id).map((c) => ({ value: c.id, label: c.path.join(' › ') }))]} />
          </>
        )}
        {del.error && <Alert tone="error">{del.error instanceof ApiError ? del.error.message : 'Could not delete.'}</Alert>}
      </div>
    </Modal>
  )
}

export function CategoriesPage() {
  const { businessId, can } = useActiveBusiness()
  const [params, setParams] = useState({ page: 1, search: '', status: '', ordering: 'sort_order' })
  const [editing, setEditing] = useState<Category | null>(null)
  const [deleting, setDeleting] = useState<Category | null>(null)
  const list = useCategories(businessId, { ...params, page_size: 12 })
  const summary = useCategorySummary(businessId)
  const canEdit = can('category.update')
  const set = (patch: Partial<typeof params>) => setParams((p) => ({ ...p, page: 1, ...patch }))

  return (
    <RequirePermission codes={['category.view']}>
      <PageHero
        icon={Folder}
        title="Categories"
        description="Organise your products with categories. Create, edit and manage categories to keep your catalogues well structured."
        illustration={heroArt}
        highlights={['Create categories & subcategories', 'Add icons and images', 'Shared by all your catalogues', 'Filterable on public pages']}
      />
      <StatGrid>
        <StatCard icon={Folder} tone="violet" label="Total categories" value={summary.data?.total ?? '—'} loading={summary.isPending} />
        <StatCard icon={Package} tone="pink" label="Categories with products" value={summary.data?.with_products ?? '—'} loading={summary.isPending} />
        <StatCard icon={Network} tone="amber" label="Subcategories" value={summary.data?.subcategories ?? '—'} loading={summary.isPending} />
        <StatCard icon={FolderTree} tone="green" label="Total products" value={summary.data?.total_products ?? '—'} loading={summary.isPending} />
      </StatGrid>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="min-w-0">
          <Toolbar>
            <SearchInput value={params.search} onChange={(search) => set({ search })} placeholder="Search categories…" />
            <FilterSelect label="Status" value={params.status} onChange={(status) => set({ status })}
              options={[{ value: '', label: 'All status' }, { value: 'published', label: 'Published' }, { value: 'draft', label: 'Draft' }]} />
            <FilterSelect label="Sort" value={params.ordering} onChange={(ordering) => set({ ordering })}
              options={[{ value: 'sort_order', label: 'Sort: Custom order' }, { value: 'name', label: 'Sort: Name A–Z' }, { value: '-created_at', label: 'Sort: Newest first' }, { value: '-product_count', label: 'Sort: Most products' }]} />
          </Toolbar>
          {list.isPending ? (
            <Spinner label="Loading categories…" />
          ) : list.isError ? (
            <ErrorState error={list.error} onRetry={() => list.refetch()} />
          ) : list.data.results.length === 0 ? (
            <EmptyState icon={Folder} title={params.search || params.status ? 'No categories match your filters' : 'No categories yet'}
              description="Every product belongs to a category. Create your first one using the form." />
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {list.data.results.map((c) => {
                const Icon = iconFor(c.icon)
                const menuItems = [
                  { label: 'Edit', icon: Pencil, onSelect: () => setEditing(c), hidden: !canEdit },
                  { label: 'Delete', icon: Trash2, danger: true, onSelect: () => setDeleting(c), hidden: !can('category.delete') },
                ]
                return (
                  <li key={c.id} className={cn('overflow-hidden rounded-2xl bg-white shadow-panel', editing?.id === c.id && 'ring-2 ring-brand-600')}>
                    <div className="relative p-1.5 pb-0">
                      <MediaThumb media={c.image} alt={c.name} className="h-[92px] w-full rounded-lg" />
                      <ActionMenu className="absolute top-3 right-3" items={menuItems} />
                    </div>
                    <div className="flex items-start gap-2.5 px-3 pt-2.5">
                      <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', chipTone(c.name))}><Icon className="size-[18px]" aria-hidden /></span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14px] font-semibold text-ink">{c.name}</p>
                        <p className="truncate text-[11.5px] text-body">
                          {c.parent ? `in ${c.parent.name} · ` : ''}{c.product_count} Products <span className="text-border">|</span> {c.children_count} Subcategories
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between px-3 pt-2 pb-3">
                      <StatusPill status={c.status} />
                      {canEdit && (
                        <button type="button" onClick={() => setEditing(c)} aria-label={`Edit ${c.name}`} title="Edit"
                          className="flex size-7 items-center justify-center rounded-md text-ink hover:bg-brand-50"><Pencil className="size-3.5" /></button>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
          {list.data && list.data.count > 0 && (
            <div className="mt-4 flex items-center justify-between px-1 text-sm text-ink">
              <span>Showing {(list.data.page - 1) * list.data.page_size + 1} to {Math.min(list.data.page * list.data.page_size, list.data.count)} of {list.data.count} categories</span>
              <Pagination page={params.page} totalPages={list.data.total_pages} count={list.data.count} onPage={(page) => setParams((p) => ({ ...p, page }))} />
            </div>
          )}
        </div>
        {(can('category.create') || editing) && (
          <aside className="xl:sticky xl:top-20 xl:self-start">
            <CategoryPanel category={editing} onClose={() => setEditing(null)} />
          </aside>
        )}
      </div>
      <DeleteCategoryModal category={deleting} onClose={() => setDeleting(null)} />
    </RequirePermission>
  )
}
