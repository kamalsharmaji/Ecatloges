import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowDown, ArrowLeft, ArrowUp, ExternalLink, GripVertical, Plus, Save, Send, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { z } from 'zod'
import { useCatalogue, useCatalogueItems, useCatalogueItemsMutation, useProducts, useSaveCatalogue } from '@/api/content'
import { useBusinessSettings } from '@/api/settings'
import { PlanLimitAlert } from '@/components/panel/PlanLimitAlert'
import { StatusPill } from '@/components/panel/StatusPill'
import { SearchInput } from '@/components/panel/Toolbar'
import { Button } from '@/components/ui/Button'
import { buttonClasses } from '@/components/ui/buttonStyles'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Alert, EmptyState, ErrorState, Spinner } from '@/components/ui/Feedback'
import { Checkbox, TextAreaField, TextField } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/toast'
import { useActiveBusiness } from '@/features/business/BusinessContext'
import { formatPrice, isPlanError } from '@/features/content/format'
import { ImagePickerField } from '@/features/content/ImagePickerField'
import { MediaThumb } from '@/features/content/MediaThumb'
import { useDragReorder } from '@/features/content/useDragReorder'
import { RequirePermission } from '@/routes/guards'
import type { Catalogue, CatalogueItem, MediaBrief } from '@/types/content'
import type { BusinessSettings } from '@/types/settings'
import { cn } from '@/utils/cn'
import { applyApiErrors } from '@/utils/formErrors'

const schema = z.object({
  name: z.string().trim().min(1, 'Enter a catalogue name.').max(150),
  slug: z.string().trim().max(80).regex(/^[a-z0-9-]*$/i, 'Use letters, numbers and dashes.'),
  description: z.string().max(1000),
  tagline: z.string().max(150),
  theme_color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a hex colour like #1d4ed8.'),
  whatsapp_number: z.string().trim().regex(/^$|^\+?[0-9][0-9\s\-()]{6,18}$/, 'Enter a valid WhatsApp number.'),
  contact_email: z.union([z.literal(''), z.string().trim().email('Enter a valid email.')]),
  show_prices: z.boolean(),
  enquiries_enabled: z.boolean(),
})
type FormValues = z.infer<typeof schema>
const FIELDS = Object.keys(schema.shape)

/** New catalogues start from the business defaults (Settings → Branding / Catalogue). */
function toForm(c?: Catalogue, defaults?: BusinessSettings): FormValues {
  return {
    name: c?.name ?? '',
    slug: c?.slug ?? '',
    description: c?.description ?? '',
    tagline: c?.tagline ?? '',
    theme_color: c?.theme_color ?? defaults?.brand_color ?? '#1d4ed8',
    whatsapp_number: c?.whatsapp_number ?? defaults?.default_whatsapp_number ?? '',
    contact_email: c?.contact_email ?? '',
    show_prices: c?.show_prices ?? defaults?.default_show_prices ?? true,
    enquiries_enabled: c?.enquiries_enabled ?? defaults?.default_enquiries_enabled ?? true,
  }
}

function DetailsForm({ catalogue }: { catalogue?: Catalogue }) {
  const { businessId, can } = useActiveBusiness()
  const navigate = useNavigate()
  const toast = useToast()
  const save = useSaveCatalogue()
  const defaults = useBusinessSettings(catalogue ? null : businessId).data
  const [cover, setCover] = useState<MediaBrief | null>(catalogue?.cover ?? null)
  const [logo, setLogo] = useState<MediaBrief | null>(catalogue?.logo ?? null)
  const [formError, setFormError] = useState<string | null>(null)
  const editable = catalogue ? can('catalogue.update') : can('catalogue.create')
  const {
    register,
    control,
    handleSubmit,
    setError,
    reset,
    getValues,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: toForm(catalogue, defaults) })

  useEffect(() => {
    reset(toForm(catalogue))
    setCover(catalogue?.cover ?? null)
    setLogo(catalogue?.logo ?? null)
  }, [catalogue, reset])
  // Defaults may arrive after the form rendered; apply them unless the user already started typing.
  useEffect(() => {
    if (!catalogue && defaults && !isDirty) reset({ ...toForm(undefined, defaults), name: getValues('name') })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaults])

  const submit = (status?: 'published') =>
    handleSubmit(async (values) => {
      setFormError(null)
      try {
        const saved = await save.mutateAsync({
          id: catalogue?.id,
          ...values,
          slug: values.slug || undefined,
          cover_id: cover?.id ?? null,
          logo_id: logo?.id ?? null,
          ...(status ? { status } : {}),
        })
        toast.show(catalogue ? 'Catalogue saved.' : 'Catalogue created.')
        if (!catalogue) navigate(`/app/catalogues/${saved.id}?tab=products`, { replace: true })
      } catch (error) {
        if (!isPlanError(error)) setFormError(applyApiErrors(error, setError, FIELDS, { cover_id: 'name', logo_id: 'name' }))
      }
    })

  return (
    <form onSubmit={submit()} noValidate>
      <fieldset disabled={!editable || isSubmitting} className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-6">
          <PlanLimitAlert error={save.error} />
          {formError && <Alert tone="error">{formError}</Alert>}
          <Card>
            <CardHeader title="Catalogue details" />
            <CardBody className="space-y-4">
              <TextField label="Catalogue name" required error={errors.name?.message} {...register('name')} />
              <TextField
                label="Link name"
                hint={catalogue ? 'Changing this changes the public link — links you already shared will stop working.' : 'Leave empty to create one from the name.'}
                error={errors.slug?.message}
                {...register('slug')}
              />
              <TextField label="Tagline" placeholder="Shown under the title on your public page" error={errors.tagline?.message} {...register('tagline')} />
              <TextAreaField label="Description" error={errors.description?.message} {...register('description')} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Contact & enquiries" description="Shown on the public catalogue." />
            <CardBody className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField label="WhatsApp number" type="tel" placeholder="+91 98765 43210" error={errors.whatsapp_number?.message} {...register('whatsapp_number')} />
                <TextField label="Contact email" type="email" error={errors.contact_email?.message} {...register('contact_email')} />
              </div>
              <Checkbox label="Show product prices on the public catalogue" {...register('show_prices')} />
              <Checkbox label="Let visitors send enquiries (enquiry form and WhatsApp button)" {...register('enquiries_enabled')} />
            </CardBody>
          </Card>
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Branding" />
            <CardBody className="space-y-4">
              <ImagePickerField label="Cover image" value={cover} onChange={setCover} folder="catalogues" disabled={!editable} hint="Shown as the hero image and on catalogue cards." />
              <ImagePickerField label="Logo" value={logo} onChange={setLogo} folder="banners" aspect="aspect-square max-w-40" disabled={!editable} />
              <Controller
                control={control}
                name="theme_color"
                render={({ field }) => (
                  <div className="space-y-1.5">
                    <label htmlFor="theme-color" className="block text-sm font-medium">Brand colour</label>
                    <div className="flex items-center gap-2">
                      <input id="theme-color" type="color" value={field.value} onChange={(e) => field.onChange(e.target.value)} className="h-10 w-14 cursor-pointer rounded-lg border border-border" />
                      <input aria-label="Brand colour hex" value={field.value} onChange={(e) => field.onChange(e.target.value)} className="h-10 w-28 rounded-lg border border-border px-3 font-mono text-sm" />
                    </div>
                    {errors.theme_color && <p className="text-xs text-red-600">{errors.theme_color.message}</p>}
                  </div>
                )}
              />
            </CardBody>
          </Card>
          {editable && (
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="submit" variant={catalogue?.status === 'published' ? 'primary' : 'secondary'} loading={isSubmitting} icon={<Save className="size-4" />}>
                {catalogue ? 'Save changes' : 'Save as draft'}
              </Button>
              {can('catalogue.publish') && catalogue?.status !== 'published' && (
                <Button onClick={submit('published')} loading={isSubmitting} icon={<Send className="size-4" />}>
                  {catalogue ? 'Save & publish' : 'Create & publish'}
                </Button>
              )}
            </div>
          )}
        </div>
      </fieldset>
    </form>
  )
}

function AddProductsModal({ catalogueId, open, onClose }: { catalogueId: string; open: boolean; onClose: () => void }) {
  const { businessId } = useActiveBusiness()
  const toast = useToast()
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const products = useProducts(open ? businessId : null, { search, exclude_catalogue: catalogueId, page_size: 50, ordering: 'name' })
  const add = useCatalogueItemsMutation()
  const close = () => {
    setSelected([])
    onClose()
  }
  return (
    <Modal
      open={open}
      onClose={close}
      size="lg"
      title="Add products"
      description="Products can be in several catalogues. Only published products are visible publicly."
      footer={
        <>
          <Button variant="secondary" onClick={close}>Cancel</Button>
          <Button
            disabled={selected.length === 0}
            loading={add.isPending}
            onClick={() =>
              add.mutate(
                { id: catalogueId, op: 'add', productIds: selected },
                { onSuccess: () => { toast.show(`${selected.length} product(s) added.`); close() }, onError: (e) => toast.show(e.message, 'error') },
              )
            }
          >
            Add {selected.length || ''} products
          </Button>
        </>
      }
    >
      <SearchInput value={search} onChange={setSearch} placeholder="Search products by name or SKU" className="mb-3 sm:w-full" />
      {products.isPending ? (
        <Spinner />
      ) : products.isError ? (
        <ErrorState error={products.error} onRetry={() => products.refetch()} />
      ) : products.data.results.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">
          No more products to add. <Link to="/app/products/new" className="font-medium text-brand-700 underline">Create a product</Link>
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {products.data.results.map((p) => (
            <li key={p.id}>
              <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-canvas">
                <input
                  type="checkbox"
                  className="size-4 accent-brand-700"
                  checked={selected.includes(p.id)}
                  onChange={(e) => setSelected((cur) => (e.target.checked ? [...cur, p.id] : cur.filter((id) => id !== p.id)))}
                />
                <MediaThumb media={p.thumbnail} className="size-10 shrink-0 rounded-md" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{p.name}</span>
                  <span className="block truncate text-xs text-muted">{p.category.name}{p.sku && ` · ${p.sku}`}</span>
                </span>
                <StatusPill status={p.status} />
              </label>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}

function ProductsTab({ catalogue }: { catalogue: Catalogue }) {
  const { businessId, can } = useActiveBusiness()
  const toast = useToast()
  const items = useCatalogueItems(businessId, catalogue.id)
  const mutate = useCatalogueItemsMutation()
  const [order, setOrder] = useState<CatalogueItem[]>([])
  const [adding, setAdding] = useState(false)
  const editable = can('catalogue.update')

  useEffect(() => setOrder(items.data?.results ?? []), [items.data])

  const persist = (next: CatalogueItem[]) => {
    setOrder(next)
    mutate.mutate(
      { id: catalogue.id, op: 'reorder', productIds: next.map((i) => i.product_id) },
      { onError: (e) => { toast.show(e.message, 'error'); setOrder(items.data?.results ?? []) } },
    )
  }
  const drag = useDragReorder(order, persist)

  return (
    <Card>
      <CardHeader
        title={`Products in this catalogue (${order.length})`}
        description={editable ? 'Drag to reorder. Visitors see published products in this order.' : undefined}
        action={editable && <Button icon={<Plus className="size-4" />} onClick={() => setAdding(true)}>Add products</Button>}
      />
      <CardBody className="p-0">
        <PlanLimitAlert error={mutate.error} className="m-4" />
        {items.isPending ? (
          <Spinner />
        ) : items.isError ? (
          <div className="p-5"><ErrorState error={items.error} onRetry={() => items.refetch()} /></div>
        ) : order.length === 0 ? (
          <div className="p-5">
            <EmptyState icon={Plus} title="No products yet" description="Add products to show them in this catalogue." />
          </div>
        ) : (
          <ol className="divide-y divide-border">
            {order.map((item, index) => (
              <li
                key={item.product_id}
                {...(editable ? drag.itemProps(index) : {})}
                className={cn('flex items-center gap-3 px-4 py-2.5', drag.overIndex === index && drag.dragIndex !== index && 'bg-brand-50', drag.dragIndex === index && 'opacity-50')}
              >
                {editable && <GripVertical className="size-4 shrink-0 cursor-grab text-muted" aria-hidden />}
                <span className="w-6 text-xs text-muted tabular-nums">{index + 1}</span>
                <MediaThumb media={item.thumbnail} className="size-11 shrink-0 rounded-md" />
                <Link to={`/app/products/${item.product_id}`} className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium hover:text-brand-700">{item.name}</span>
                  <span className="block truncate text-xs text-muted">
                    {item.category.name}
                    {item.price && ` · ${formatPrice(item.price, item.currency)}`}
                  </span>
                </Link>
                <StatusPill status={item.status} />
                {editable && (
                  <div className="flex gap-0.5">
                    <Button variant="ghost" size="sm" aria-label={`Move ${item.name} up`} disabled={index === 0} icon={<ArrowUp className="size-4" />} onClick={() => drag.move(index, index - 1)} />
                    <Button variant="ghost" size="sm" aria-label={`Move ${item.name} down`} disabled={index === order.length - 1} icon={<ArrowDown className="size-4" />} onClick={() => drag.move(index, index + 1)} />
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Remove ${item.name} from catalogue`}
                      icon={<Trash2 className="size-4" />}
                      onClick={() => mutate.mutate({ id: catalogue.id, op: 'remove', productIds: [item.product_id] }, { onSuccess: () => toast.show('Removed from catalogue.') })}
                    />
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}
      </CardBody>
      <AddProductsModal catalogueId={catalogue.id} open={adding} onClose={() => setAdding(false)} />
    </Card>
  )
}

export function CatalogueEditorPage() {
  const { catalogueId } = useParams()
  const { businessId } = useActiveBusiness()
  const catalogue = useCatalogue(businessId, catalogueId)
  const [tab, setTab] = useState<'details' | 'products'>(() =>
    new URLSearchParams(window.location.search).get('tab') === 'products' ? 'products' : 'details',
  )
  const isNew = !catalogueId

  return (
    <RequirePermission codes={[isNew ? 'catalogue.create' : 'catalogue.view']}>
      <Link to="/app/catalogues" className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline">
        <ArrowLeft className="size-4" aria-hidden /> All catalogues
      </Link>
      {!isNew && catalogue.isPending ? (
        <Spinner />
      ) : !isNew && catalogue.isError ? (
        <ErrorState error={catalogue.error} onRetry={() => catalogue.refetch()} />
      ) : (
        <>
          <div className="mb-6 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">{isNew ? 'Create catalogue' : catalogue.data!.name}</h1>
            {!isNew && <StatusPill status={catalogue.data!.status} />}
            {!isNew && catalogue.data!.status === 'published' && (
              <a href={catalogue.data!.public_url} target="_blank" rel="noreferrer" className={buttonClasses('secondary', 'sm', 'ml-auto')}>
                <ExternalLink className="size-4" aria-hidden /> View public page
              </a>
            )}
          </div>
          {!isNew && (
            <div role="tablist" className="mb-6 flex gap-1 border-b border-border">
              {(
                [
                  ['details', 'Details & branding'],
                  ['products', `Products (${catalogue.data!.product_count})`],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  role="tab"
                  type="button"
                  aria-selected={tab === key}
                  onClick={() => setTab(key)}
                  className={cn('-mb-px border-b-2 px-4 py-2 text-sm font-medium', tab === key ? 'border-brand-700 text-brand-700' : 'border-transparent text-muted hover:text-ink')}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          {isNew || tab === 'details' ? <DetailsForm catalogue={catalogue.data} /> : <ProductsTab catalogue={catalogue.data!} />}
        </>
      )}
    </RequirePermission>
  )
}
