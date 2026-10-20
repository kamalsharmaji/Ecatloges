import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeft, Copy, Save, Send } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { z } from 'zod'
import { useAllCategories, useCatalogues, useProduct, useProductAction, useSaveProduct } from '@/api/content'
import { PlanLimitAlert } from '@/components/panel/PlanLimitAlert'
import { StatusPill } from '@/components/panel/StatusPill'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Alert, ErrorState, Spinner } from '@/components/ui/Feedback'
import { Checkbox, SelectField, TextAreaField, TextField } from '@/components/ui/Field'
import { useToast } from '@/components/ui/toast'
import { useActiveBusiness } from '@/features/business/BusinessContext'
import { isPlanError } from '@/features/content/format'
import { ProductMediaEditor } from '@/features/content/ProductMediaEditor'
import { ListInput, TagInput } from '@/features/content/TagInput'
import { RequirePermission } from '@/routes/guards'
import type { ContentStatus, MediaBrief, Product } from '@/types/content'
import { applyApiErrors } from '@/utils/formErrors'

const MAX_MEDIA = 20 // mirrors MEDIA_MAX_ITEMS_PER_PRODUCT; the server enforces the real value
const money = z.string().trim().regex(/^$|^\d{1,10}(\.\d{1,2})?$/, 'Enter an amount like 999 or 999.50.')

const schema = z
  .object({
    name: z.string().trim().min(1, 'Enter a product name.').max(200),
    short_description: z.string().trim().min(1, 'Enter a short description.').max(300),
    description: z.string().max(5000),
    category_id: z.string().min(1, 'Choose a category.'),
    sku: z.string().trim().max(64),
    price: money,
    compare_at_price: money,
    moq: z.string().trim().regex(/^$|^[1-9]\d{0,8}$/, 'Whole number of at least 1.'),
    moq_unit: z.string().trim().max(20),
    stock_status: z.enum(['in_stock', 'out_of_stock', 'made_to_order']),
    show_price: z.boolean(),
    is_featured: z.boolean(),
    status: z.enum(['draft', 'published', 'archived']),
  })
  .refine((v) => !v.price || !v.compare_at_price || Number(v.compare_at_price) >= Number(v.price), {
    path: ['compare_at_price'],
    message: 'Compare price must be at least the price.',
  })
type FormValues = z.infer<typeof schema>
const FIELDS = [...Object.keys(schema.innerType().shape), 'media_ids', 'catalogue_ids', 'tags', 'highlights']
const UNITS = ['units', 'pieces', 'sets', 'pairs', 'boxes', 'cartons', 'kg', 'metres', 'litres', 'dozens']

function toForm(p?: Product): FormValues {
  return {
    name: p?.name ?? '',
    short_description: p?.short_description ?? '',
    description: p?.description ?? '',
    category_id: p?.category.id ?? '',
    sku: p?.sku ?? '',
    price: p?.price ?? '',
    compare_at_price: p?.compare_at_price ?? '',
    moq: p?.moq ? String(p.moq) : '',
    moq_unit: p?.moq_unit ?? 'units',
    stock_status: p?.stock_status ?? 'in_stock',
    show_price: p?.show_price ?? true,
    is_featured: p?.is_featured ?? false,
    status: p?.status ?? 'draft',
  }
}

function ProductForm({ product }: { product?: Product }) {
  const { businessId, can } = useActiveBusiness()
  const navigate = useNavigate()
  const toast = useToast()
  const categories = useAllCategories(businessId)
  const catalogues = useCatalogues(businessId, { page_size: 100, ordering: 'name' })
  const save = useSaveProduct()
  const action = useProductAction()
  const [media, setMedia] = useState<MediaBrief[]>(product?.media ?? [])
  const [tags, setTags] = useState<string[]>(product?.tags ?? [])
  const [highlights, setHighlights] = useState<string[]>(product?.highlights ?? [])
  const [catalogueIds, setCatalogueIds] = useState<string[]>(product?.catalogues.map((c) => c.id) ?? [])
  const [formError, setFormError] = useState<string | null>(null)
  const editable = product ? can('product.update') : can('product.create')
  const canPublish = can('product.publish')
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: toForm(product) })
  const [name, shortDescription, price, compare, status] = useWatch({ control, name: ['name', 'short_description', 'price', 'compare_at_price', 'status'] })
  const discount = price && compare && Number(compare) > Number(price) ? Math.round((1 - Number(price) / Number(compare)) * 100) : null

  useEffect(() => {
    if (!product) return
    setMedia(product.media)
    setTags(product.tags)
    setHighlights(product.highlights)
    setCatalogueIds(product.catalogues.map((c) => c.id))
  }, [product])

  const submit = (override?: ContentStatus) =>
    handleSubmit(async (v) => {
      setFormError(null)
      try {
        const saved = await save.mutateAsync({
          id: product?.id,
          name: v.name,
          short_description: v.short_description,
          description: v.description,
          category_id: v.category_id,
          sku: v.sku,
          price: v.price || null,
          compare_at_price: v.compare_at_price || null,
          moq: v.moq ? Number(v.moq) : null,
          moq_unit: v.moq_unit || 'units',
          stock_status: v.stock_status,
          show_price: v.show_price,
          is_featured: v.is_featured,
          status: override ?? v.status,
          tags,
          highlights: highlights.map((h) => h.trim()).filter(Boolean),
          media_ids: media.map((m) => m.id),
          catalogue_ids: catalogueIds,
        })
        setValue('status', saved.status)
        toast.show(product ? 'Product updated.' : `Product created${saved.status === 'published' ? ' and published' : ' as a draft'}.`)
        if (!product) navigate(`/app/products/${saved.id}`, { replace: true })
      } catch (error) {
        if (!isPlanError(error)) setFormError(applyApiErrors(error, setError, FIELDS))
      }
    })

  return (
    <form onSubmit={submit()} noValidate>
      <nav aria-label="Breadcrumb" className="mb-2 flex items-center gap-2 pl-1 text-[13px] text-body">
        <Link to="/app/products" className="hover:text-brand-700">Products</Link>
        <span aria-hidden>›</span>
        <span className="font-medium text-ink">{product ? 'Edit Product' : 'Add Product'}</span>
      </nav>
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <Link to="/app/products" aria-label="Back to products" className="flex size-16 items-center justify-center rounded-2xl bg-white text-brand-700 shadow-panel hover:bg-brand-50">
          <ArrowLeft className="size-6" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-3 text-[28px] leading-tight font-bold tracking-tight text-ink">
            {product ? 'Edit Product' : 'Add Product'} {product && <StatusPill status={product.status} />}
          </h1>
          <p className="text-[15px] text-body">{product ? 'Update product details, images, videos and other information.' : 'Add details, images and videos, then save as a draft or publish.'}</p>
        </div>
        {editable && (
          <div className="flex flex-wrap gap-2">
            {product && can('product.create') && (
              <Button variant="secondary" icon={<Copy className="size-4" />} loading={action.isPending}
                onClick={() => action.mutate({ id: product.id, action: 'duplicate' }, { onSuccess: (copy) => { toast.show('Duplicated as a draft.'); if (copy) navigate(`/app/products/${copy.id}`) } })}>
                Duplicate
              </Button>
            )}
            <Button variant="secondary" loading={isSubmitting} icon={<Save className="size-4" />} onClick={submit('draft')}
              disabled={product?.status === 'published' && !canPublish}>
              Save as Draft
            </Button>
            <Button type="submit" size="lg" loading={isSubmitting} icon={<Send className="size-4" />}
              disabled={status === 'published' && !canPublish && product?.status !== 'published'}>
              {product ? 'Update Product' : status === 'published' ? 'Publish Product' : 'Create Product'}
            </Button>
          </div>
        )}
      </div>
      <fieldset disabled={!editable || isSubmitting} className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <PlanLimitAlert error={save.error ?? action.error} />
          {formError && <Alert tone="error">{formError}</Alert>}
          <Card>
            <CardHeader title="Product Images & Videos" description="Upload high quality images and videos. Drag and drop to reorder." />
            <CardBody>
              <ProductMediaEditor value={media} onChange={setMedia} max={MAX_MEDIA} canUpload={can('media.upload')} disabled={!editable} />
              {errors.root && <p className="mt-2 text-xs text-red-600">{errors.root.message}</p>}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Product Details" />
            <CardBody className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-4">
                <TextField label="Product name" required maxLength={200} hint={`${name.length}/200`} error={errors.name?.message} {...register('name')} />
                <TextAreaField label="Short description" required maxLength={300} hint={`${shortDescription.length}/300 · shown on product cards`} error={errors.short_description?.message} {...register('short_description')} />
                <TextAreaField label="Full description" className="min-h-40" maxLength={5000} error={errors.description?.message} {...register('description')} />
              </div>
              <div className="space-y-4">
                <SelectField label="Category" required error={errors.category_id?.message} {...register('category_id')}>
                  <option value="">{categories.isPending ? 'Loading categories…' : 'Choose a category'}</option>
                  {(categories.data?.results ?? []).map((c) => (
                    <option key={c.id} value={c.id}>{c.path.join(' › ')}</option>
                  ))}
                </SelectField>
                {categories.data?.results.length === 0 && (
                  <p className="text-xs text-muted">No categories yet. <Link to="/app/categories" className="font-medium text-brand-700 underline">Create one</Link> first.</p>
                )}
                <TagInput label="Tags" value={tags} onChange={setTags} disabled={!editable} />
                <ListInput label="Product highlights" value={highlights} onChange={setHighlights} disabled={!editable} />
              </div>
            </CardBody>
          </Card>
        </div>
        <div className="space-y-4">
          <Card>
            <CardHeader title="Product Status" />
            <CardBody className="space-y-4">
              <fieldset className="space-y-2">
                <legend className="mb-1 text-sm font-medium">Visibility</legend>
                {(
                  [
                    ['published', 'Published (visible in published catalogues)'],
                    ['draft', 'Draft (not visible)'],
                    ...(product?.status === 'archived' ? [['archived', 'Archived (hidden, not counted in plan)'] as const] : []),
                  ] as const
                ).map(([value, label]) => (
                  <label key={value} className="flex items-center gap-2 text-sm">
                    <input type="radio" value={value} className="size-4 accent-brand-700" disabled={!canPublish && (value === 'published' || product?.status === 'published')} {...register('status')} />
                    {label}
                  </label>
                ))}
                {!canPublish && <p className="text-xs text-muted">Your role can save drafts; someone with publish permission must publish.</p>}
              </fieldset>
              <Checkbox label="Featured product (highlighted on the public catalogue)" {...register('is_featured')} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Pricing & Inventory" />
            <CardBody className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <TextField label="Price (optional)" inputMode="decimal" placeholder="₹" error={errors.price?.message} {...register('price')} />
                <TextField label="Compare price (optional)" inputMode="decimal" error={errors.compare_at_price?.message} {...register('compare_at_price')} />
                <TextField label="Discount" value={discount !== null ? `${discount}%` : '—'} readOnly disabled hint="Calculated" />
                <TextField label="SKU (optional)" error={errors.sku?.message} {...register('sku')} />
                <TextField label="MOQ (optional)" inputMode="numeric" error={errors.moq?.message} {...register('moq')} />
                <SelectField label="Unit" {...register('moq_unit')}>
                  {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                </SelectField>
              </div>
              <SelectField label="Stock status" {...register('stock_status')}>
                <option value="in_stock">In stock</option>
                <option value="made_to_order">Made to order</option>
                <option value="out_of_stock">Out of stock</option>
              </SelectField>
              <Checkbox label="Show price on public catalogue" {...register('show_price')} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Catalogues" description="Show this product in one or more catalogues." />
            <CardBody>
              {catalogues.isPending ? (
                <Spinner />
              ) : (catalogues.data?.results ?? []).length === 0 ? (
                <p className="text-sm text-muted">No catalogues yet. <Link to="/app/catalogues/new" className="font-medium text-brand-700 underline">Create one</Link>.</p>
              ) : (
                <ul className="max-h-64 space-y-1.5 overflow-y-auto">
                  {catalogues.data!.results.map((c) => (
                    <li key={c.id}>
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" className="size-4 accent-brand-700" checked={catalogueIds.includes(c.id)}
                          onChange={(e) => setCatalogueIds((cur) => (e.target.checked ? [...cur, c.id] : cur.filter((id) => id !== c.id)))} />
                        <span className="flex-1 truncate">{c.name}</span>
                        <StatusPill status={c.status} />
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>
      </fieldset>
    </form>
  )
}

export function ProductEditorPage() {
  const { productId } = useParams()
  const { businessId } = useActiveBusiness()
  const product = useProduct(businessId, productId)
  const isNew = !productId
  return (
    <RequirePermission codes={[isNew ? 'product.create' : 'product.view']}>
      {!isNew && product.isPending ? (
        <Spinner label="Loading product…" />
      ) : !isNew && product.isError ? (
        <ErrorState error={product.error} onRetry={() => product.refetch()} />
      ) : (
        <ProductForm key={product.data?.id ?? 'new'} product={product.data} />
      )}
    </RequirePermission>
  )
}
