import {
  ArrowRight, ChevronLeft, ChevronRight, Copy, Facebook, Instagram, Linkedin, MessageCircle, Search, Send, Share2, Star, Twitter, X, Youtube,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { usePublicCatalogue, usePublicProduct, usePublicProducts } from '@/api/content'
import { ApiError, API_BASE_URL } from '@/api/client'
import { detectSource, trackView } from '@/api/leads'
import { Logo } from '@/components/Logo'
import { Spinner } from '@/components/ui/Feedback'
import { iconFor } from '@/features/content/categoryIcons'
import { formatPrice } from '@/features/content/format'
import { MediaThumb } from '@/features/content/MediaThumb'
import { EnquiryFormModal, type EnquiryTarget } from '@/features/public/EnquiryFormModal'
import type { MediaBrief, PublicCatalogue, PublicProduct } from '@/types/content'
import type { TrafficSource } from '@/types/leads'
import { cn } from '@/utils/cn'

/** wa.me needs digits only (international format without +). */
function whatsappLink(number: string, text: string) {
  return `https://wa.me/${number.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`
}

const SOCIAL_ORDER = [
  { key: 'facebook', label: 'Facebook', icon: Facebook },
  { key: 'instagram', label: 'Instagram', icon: Instagram },
  { key: 'youtube', label: 'YouTube', icon: Youtube },
  { key: 'linkedin', label: 'LinkedIn', icon: Linkedin },
  { key: 'x', label: 'X (Twitter)', icon: Twitter },
] as const

const STOCK: Record<string, string> ={ in_stock: 'In stock', out_of_stock: 'Out of stock', made_to_order: 'Made to order' }

function Price({ product, large = false }: { product: PublicProduct; large?: boolean }) {
  const price = formatPrice(product.price, product.currency)
  if (!price) return <p className={cn('font-medium text-slate-500', large ? 'text-lg' : 'text-sm')}>Price on request</p>
  const compare = formatPrice(product.compare_at_price, product.currency)
  return (
    <p className="flex items-baseline gap-2">
      <span className={cn('font-bold text-[var(--brand)]', large ? 'text-3xl' : 'text-lg')}>{price}</span>
      {compare && <span className="text-sm text-slate-400 line-through">{compare}</span>}
    </p>
  )
}

function Gallery({ media }: { media: MediaBrief[] }) {
  const [index, setIndex] = useState(0)
  const current = media[index]
  if (!current) return <MediaThumb media={null} className="aspect-square w-full rounded-xl" />
  return (
    <div>
      <div className="relative overflow-hidden rounded-xl bg-slate-100">
        {current.kind === 'video' ? (
          <video key={current.id} controls preload="metadata" src={current.preview_url ?? undefined} className="aspect-square w-full bg-black object-contain" />
        ) : (
          <img src={current.preview_url ?? undefined} alt={current.alt_text || current.title} className="aspect-square w-full object-contain" />
        )}
        {media.length > 1 && (
          <>
            <button type="button" aria-label="Previous image" onClick={() => setIndex((i) => (i - 1 + media.length) % media.length)}
              className="absolute top-1/2 left-2 -translate-y-1/2 rounded-full bg-white/90 p-1.5 shadow"><ChevronLeft className="size-5" /></button>
            <button type="button" aria-label="Next image" onClick={() => setIndex((i) => (i + 1) % media.length)}
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full bg-white/90 p-1.5 shadow"><ChevronRight className="size-5" /></button>
          </>
        )}
      </div>
      {media.length > 1 && (
        <ul className="mt-2 flex gap-2 overflow-x-auto pb-1">
          {media.map((m, i) => (
            <li key={m.id}>
              <button type="button" aria-label={`Show image ${i + 1}`} aria-current={i === index} onClick={() => setIndex(i)}
                className={cn('block size-16 overflow-hidden rounded-lg ring-2', i === index ? 'ring-[var(--brand)]' : 'ring-transparent')}>
                <MediaThumb media={m} className="size-full" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ProductModal({ catalogue, businessSlug, catalogueSlug, productId, source, onClose, onEnquire }: {
  catalogue: PublicCatalogue; businessSlug: string; catalogueSlug: string; productId: string; source: TrafficSource
  onClose: () => void; onEnquire: (target: EnquiryTarget) => void
}) {
  const product = usePublicProduct(businessSlug, catalogueSlug, productId)
  const [copied, setCopied] = useState(false)
  // One product-view beacon per opening (the server also de-duplicates repeat views).
  useEffect(() => {
    trackView(businessSlug, catalogueSlug, source, productId)
  }, [businessSlug, catalogueSlug, source, productId])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])
  const link = `${catalogue.public_url}?product=${productId}`

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Product details" onClick={onClose}>
      <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl sm:p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex justify-end">
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100"><X className="size-5" /></button>
        </div>
        {product.isPending ? (
          <Spinner />
        ) : product.isError ? (
          <p className="py-10 text-center text-slate-600">This product is no longer available.</p>
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            <Gallery media={product.data.media} />
            <div>
              <p className="text-sm text-slate-500">{product.data.category.name}</p>
              <h2 className="mt-1 text-2xl font-bold">{product.data.name}</h2>
              {product.data.sku && <p className="text-sm text-slate-500">SKU: {product.data.sku}</p>}
              <div className="mt-4"><Price product={product.data} large /></div>
              <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm">
                {product.data.moq && <div><dt className="inline text-slate-500">MOQ: </dt><dd className="inline font-medium">{product.data.moq} {product.data.moq_unit}</dd></div>}
                <div><dt className="inline text-slate-500">Availability: </dt><dd className="inline font-medium">{STOCK[product.data.stock_status]}</dd></div>
              </dl>
              <p className="mt-4 text-slate-700">{product.data.short_description}</p>
              {product.data.highlights.length > 0 && (
                <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-slate-700">{product.data.highlights.map((h) => <li key={h}>{h}</li>)}</ul>
              )}
              {product.data.description && <p className="mt-4 text-sm whitespace-pre-line text-slate-600">{product.data.description}</p>}
              {product.data.tags.length > 0 && (
                <ul className="mt-4 flex flex-wrap gap-1.5">{product.data.tags.map((t) => <li key={t} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600">{t}</li>)}</ul>
              )}
              <div className="mt-6 flex flex-wrap gap-2">
                {catalogue.enquiries_enabled && (
                  <button type="button" onClick={() => onEnquire({ productId: product.data.id, productName: product.data.name })}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-[var(--brand)] px-4 py-2.5 font-medium text-white hover:opacity-90">
                    <Send className="size-4" aria-hidden /> Send Enquiry
                  </button>
                )}
                {catalogue.whatsapp_number && catalogue.enquiries_enabled && (
                  <a href={whatsappLink(catalogue.whatsapp_number, `Hi, I'm interested in "${product.data.name}"${product.data.sku ? ` (SKU ${product.data.sku})` : ''} from your ${catalogue.name} catalogue: ${link}`)}
                    target="_blank" rel="noreferrer" className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 font-medium text-white hover:bg-emerald-700">
                    <MessageCircle className="size-4" aria-hidden /> WhatsApp
                  </a>
                )}
                <button type="button" onClick={async () => { await navigator.clipboard?.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium hover:bg-slate-50">
                  <Share2 className="size-4" aria-hidden /> {copied ? 'Link copied' : 'Share'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export function PublicCataloguePage() {
  const { businessSlug = '', catalogueSlug = '' } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [category, setCategory] = useState('')
  const catalogue = usePublicCatalogue(businessSlug, catalogueSlug)
  const products = usePublicProducts(businessSlug, catalogueSlug, { search: debounced, category, page_size: 12 }, catalogue.isSuccess)
  const openProduct = searchParams.get('product')
  const [source] = useState(() => detectSource(window.location.search, document.referrer))
  const [enquiry, setEnquiry] = useState<EnquiryTarget | null>(null)
  const [sharing, setSharing] = useState(false)
  const tracked = useRef(false)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300)
    return () => clearTimeout(t)
  }, [search])
  useEffect(() => {
    // Count the page view once per load, only after the published catalogue actually loaded.
    if (catalogue.isSuccess && !tracked.current) {
      tracked.current = true
      trackView(businessSlug, catalogueSlug, source)
    }
  }, [catalogue.isSuccess, businessSlug, catalogueSlug, source])
  useEffect(() => {
    if (catalogue.data) document.title = `${catalogue.data.name} · ${catalogue.data.business.name}`
  }, [catalogue.data])

  const style = useMemo(() => ({ '--brand': catalogue.data?.theme_color ?? '#1d4ed8' }) as CSSProperties, [catalogue.data])

  if (catalogue.isPending) return <div className="flex min-h-screen items-center justify-center"><Spinner label="Loading catalogue…" /></div>
  if (catalogue.isError) {
    const notFound = catalogue.error instanceof ApiError && catalogue.error.status === 404
    return (
      <main className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
        <h1 className="text-2xl font-bold">{notFound ? 'Catalogue not available' : 'Something went wrong'}</h1>
        <p className="mt-2 max-w-md text-slate-600">
          {notFound ? 'This catalogue link is not active. It may have been unpublished or moved.' : 'Please try again in a moment.'}
        </p>
        <a href="/" className="mt-8 opacity-70"><Logo /></a>
      </main>
    )
  }

  const c = catalogue.data
  const whatsapp = c.whatsapp_number && c.enquiries_enabled ? whatsappLink(c.whatsapp_number, `Hi, I saw your "${c.name}" catalogue (${c.public_url}) and would like to know more.`) : null
  const results = products.data?.pages.flatMap((p) => p.results) ?? []
  const total = products.data?.pages[0]?.count ?? 0

  return (
    <div style={style} className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4">
          <a href="#top" className="flex min-w-0 items-center gap-2">
            {(c.logo ?? c.business.logo) ? <MediaThumb media={c.logo ?? c.business.logo} className="size-9 rounded-lg" alt={c.business.name} /> : (
              <span className="flex size-9 items-center justify-center rounded-lg bg-[var(--brand)] font-bold text-white">{c.business.name[0]}</span>
            )}
            <span className="truncate font-bold">{c.business.name}</span>
          </a>
          <label className="relative ml-auto hidden w-72 md:block">
            <span className="sr-only">Search products</span>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products…"
              className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pr-3 pl-9 text-sm focus:border-[var(--brand)] focus:outline-none" />
          </label>
          <button type="button" onClick={() => setSharing(true)} aria-label="Share catalogue"
            className="ml-auto inline-flex shrink-0 items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium hover:bg-slate-50 md:ml-0">
            <Share2 className="size-4" aria-hidden /> <span className="hidden sm:inline">Share</span>
          </button>
          {c.enquiries_enabled && (
            <button type="button" onClick={() => setEnquiry({ productId: null, productName: null })}
              className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white hover:opacity-90">
              <Send className="size-4" aria-hidden /> <span className="hidden sm:inline">Enquire Now</span>
            </button>
          )}
        </div>
      </header>

      <main id="top" className="mx-auto max-w-6xl space-y-10 px-4 py-6 sm:py-10">
        <section className="grid items-center gap-6 overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-200 md:grid-cols-2">
          <div className="order-2 p-6 sm:p-10 md:order-1">
            <h1 className="text-3xl font-bold tracking-tight sm:text-5xl">{c.name}</h1>
            {c.tagline && <p className="mt-3 text-lg font-medium text-[var(--brand)]">{c.tagline}</p>}
            {c.description && <p className="mt-3 text-slate-600">{c.description}</p>}
            <div className="mt-6 flex flex-wrap gap-3">
              <a href="#products" className="inline-flex items-center gap-2 rounded-lg bg-[var(--brand)] px-5 py-2.5 font-medium text-white hover:opacity-90">
                View Products <ArrowRight className="size-4" aria-hidden />
              </a>
              {whatsapp && (
                <a href={whatsapp} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-emerald-300 px-5 py-2.5 font-medium text-emerald-700 hover:bg-emerald-50">
                  <MessageCircle className="size-4" aria-hidden /> Contact on WhatsApp
                </a>
              )}
            </div>
          </div>
          <div className="order-1 md:order-2">
            {c.cover ? <img src={c.cover.preview_url ?? undefined} alt="" className="aspect-[4/3] w-full object-cover md:aspect-auto md:h-full md:min-h-80" /> : (
              <div className="aspect-[4/3] w-full bg-gradient-to-br from-[var(--brand)] to-slate-800 opacity-80 md:h-full md:min-h-80" />
            )}
          </div>
        </section>

        <label className="relative block md:hidden">
          <span className="sr-only">Search products</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products…"
            className="h-11 w-full rounded-xl border border-slate-200 bg-white pr-3 pl-9 text-sm focus:border-[var(--brand)] focus:outline-none" />
        </label>

        {c.categories.length > 0 && (
          <section aria-labelledby="cats">
            <h2 id="cats" className="text-2xl font-bold">Shop by Category</h2>
            <p className="text-slate-500">Explore our product categories</p>
            <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {c.categories.map((cat) => {
                const Icon = iconFor(cat.icon)
                return (
                  <li key={cat.id}>
                    <button type="button" onClick={() => { setCategory(cat.id); document.getElementById('products')?.scrollIntoView({ behavior: 'smooth' }) }}
                      className={cn('w-full overflow-hidden rounded-xl bg-white text-left shadow-sm ring-1 transition hover:shadow-md', category === cat.id ? 'ring-2 ring-[var(--brand)]' : 'ring-slate-200')}>
                      {cat.image ? <MediaThumb media={cat.image} className="aspect-[4/3] w-full" /> : (
                        <span className="flex aspect-[4/3] w-full items-center justify-center bg-slate-100 text-[var(--brand)]"><Icon className="size-8" aria-hidden /></span>
                      )}
                      <span className="block px-3 py-2">
                        <span className="block truncate text-sm font-semibold">{cat.name}</span>
                        <span className="text-xs text-slate-500">{cat.product_count} products</span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        )}

        <section id="products" aria-labelledby="products-heading" className="scroll-mt-20">
          <h2 id="products-heading" className="text-2xl font-bold">{debounced ? `Results for “${debounced}”` : 'Our Products'}</h2>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Filter by category">
            {[{ id: '', name: 'All Products' }, ...c.categories].map((cat) => (
              <button key={cat.id} type="button" role="tab" aria-selected={category === cat.id} onClick={() => setCategory(cat.id)}
                className={cn('shrink-0 rounded-full px-4 py-1.5 text-sm font-medium', category === cat.id ? 'bg-[var(--brand)] text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:text-slate-900')}>
                {cat.name}
              </button>
            ))}
          </div>
          {products.isPending ? (
            <Spinner label="Loading products…" />
          ) : products.isError ? (
            <p className="py-10 text-center text-slate-600">Couldn’t load products. Please refresh the page.</p>
          ) : results.length === 0 ? (
            <p className="py-16 text-center text-slate-500">No products found.</p>
          ) : (
            <>
              <ul className="mt-5 grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
                {results.map((p) => (
                  <li key={p.id} className="flex flex-col overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
                    <button type="button" onClick={() => setSearchParams({ product: p.id })} className="relative block">
                      <MediaThumb media={p.media[0]} alt={p.name} className="aspect-square w-full" />
                      {p.is_featured && (
                        <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-md bg-red-500 px-2 py-0.5 text-[11px] font-semibold text-white">
                          <Star className="size-3 fill-current" aria-hidden /> Featured
                        </span>
                      )}
                    </button>
                    <div className="flex flex-1 flex-col p-3">
                      <h3 className="line-clamp-2 text-sm font-semibold sm:text-base">{p.name}</h3>
                      {p.sku && <p className="text-xs text-slate-500">{p.sku}</p>}
                      <div className="mt-1"><Price product={p} /></div>
                      {p.moq && <p className="text-xs text-slate-500">MOQ: {p.moq} {p.moq_unit}</p>}
                      <button type="button" onClick={() => setSearchParams({ product: p.id })}
                        className="mt-auto w-full rounded-lg border border-[var(--brand)] px-3 py-1.5 text-sm font-medium text-[var(--brand)] hover:bg-slate-50 sm:mt-3">
                        View Details
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
              {products.hasNextPage && (
                <div className="mt-6 text-center">
                  <button type="button" onClick={() => products.fetchNextPage()} disabled={products.isFetchingNextPage}
                    className="rounded-lg bg-white px-5 py-2 text-sm font-medium shadow-sm ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-60">
                    {products.isFetchingNextPage ? 'Loading…' : `Load more (${total - results.length} more)`}
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      </main>

      <footer className="mt-10 border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-slate-500">
          <p>
            <span className="font-semibold text-slate-700">{c.business.name}</span>
            {(c.business.city || c.business.state) && ` · ${[c.business.city, c.business.state].filter(Boolean).join(', ')}`}
            {c.contact_email && <> · <a href={`mailto:${c.contact_email}`} className="hover:underline">{c.contact_email}</a></>}
          </p>
          {/* Links are validated server-side (https, on the network's own domain). */}
          {Object.keys(c.business.social_links ?? {}).length > 0 && (
            <ul className="flex gap-2" aria-label={`${c.business.name} on social media`}>
              {SOCIAL_ORDER.filter(({ key }) => c.business.social_links[key]).map(({ key, label, icon: Icon }) => (
                <li key={key}>
                  <a href={c.business.social_links[key]} target="_blank" rel="noopener noreferrer nofollow" aria-label={label}
                    className="flex size-8 items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-[var(--brand)] hover:text-white">
                    <Icon className="size-4" aria-hidden />
                  </a>
                </li>
              ))}
            </ul>
          )}
          <a href="/" className="inline-flex items-center gap-1 text-xs">Powered by <span className="font-semibold text-brand-700">myEcatalogues</span></a>
        </div>
      </footer>

      {openProduct && (
        <ProductModal catalogue={c} businessSlug={businessSlug} catalogueSlug={catalogueSlug} productId={openProduct} source={source}
          onClose={() => setSearchParams({}, { replace: true })} onEnquire={setEnquiry} />
      )}
      {enquiry && (
        <EnquiryFormModal businessSlug={businessSlug} catalogueSlug={catalogueSlug} target={enquiry} source={source}
          whatsappHref={whatsapp} onClose={() => setEnquiry(null)} />
      )}
      {sharing && <ShareSheet catalogue={c} businessSlug={businessSlug} catalogueSlug={catalogueSlug} onClose={() => setSharing(false)} />}
    </div>
  )
}

function ShareSheet({ catalogue, businessSlug, catalogueSlug, onClose }: {
  catalogue: PublicCatalogue; businessSlug: string; catalogueSlug: string; onClose: () => void
}) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  const url = catalogue.public_url
  const share = async () => {
    try {
      await navigator.share({ title: catalogue.name, url })
    } catch {
      // User dismissed the native sheet — nothing to do.
    }
  }
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-900/50 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="share-title" onClick={onClose}>
      <div className="w-full max-w-sm rounded-t-2xl bg-white p-5 text-center shadow-xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <h2 id="share-title" className="text-lg font-bold">Share this catalogue</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100"><X className="size-5" /></button>
        </div>
        <img src={`${API_BASE_URL}/public/catalogues/${businessSlug}/${catalogueSlug}/qr.svg`} alt={`QR code for ${catalogue.name}`}
          className="mx-auto my-4 size-48 rounded-lg ring-1 ring-slate-200" />
        <p className="text-sm text-slate-500">Scan to open on another phone</p>
        <p className="mt-3 truncate rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">{url}</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" onClick={async () => { await navigator.clipboard?.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium hover:bg-slate-50">
            <Copy className="size-4" aria-hidden /> {copied ? 'Copied' : 'Copy link'}
          </button>
          <a href={`https://wa.me/?text=${encodeURIComponent(`${catalogue.name} — ${url}`)}`} target="_blank" rel="noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700">
            <MessageCircle className="size-4" aria-hidden /> WhatsApp
          </a>
          {typeof navigator.share === 'function' && (
            <button type="button" onClick={share} className="col-span-2 inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--brand)] px-3 py-2 text-sm font-medium text-white hover:opacity-90">
              <Share2 className="size-4" aria-hidden /> More options
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
