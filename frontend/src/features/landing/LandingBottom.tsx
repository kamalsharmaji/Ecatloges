import {
  ArrowRight,
  Check,
  Eye,
  Facebook,
  Instagram,
  Linkedin,
  Minus,
  Package,
  Plus,
  Star,
  Users,
  Youtube,
  type LucideIcon,
} from 'lucide-react'
import { useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { Logo } from '@/components/Logo'
import { initials } from '@/features/leads/leadFormat'
import { cn } from '@/utils/cn'
import { FAQS, INDUSTRIES, PRICING, STATS, TESTIMONIALS } from './content'
import { Container, SectionHeading } from './LandingTop'
import { ctaPrimary, FOOTER_COLUMNS, SOCIAL_LINKS } from './links'

// --- Statistics -------------------------------------------------------------------------------------
const STAT_ICON: Record<string, LucideIcon> = { businesses: Users, products: Package, views: Eye, rating: Star }

export function StatsBar() {
  return (
    <section aria-label="myEcatalogues in numbers" className="bg-gradient-to-r from-lp-navy via-[#0b3a8c] to-lp-navy">
      <Container>
        <ul className="grid grid-cols-2 gap-x-4 gap-y-6 py-7 lg:grid-cols-4">
          {STATS.items.map((s) => {
            const Icon = STAT_ICON[s.key] ?? Star
            return (
              <li key={s.key} className="flex items-center gap-3 lg:justify-center">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/20">
                  <Icon className={cn('size-5', s.key === 'rating' ? 'fill-amber-400 text-amber-400' : 'text-sky-300')} aria-hidden />
                </span>
                <div>
                  <p className="text-xl font-extrabold text-white sm:text-2xl">{s.value}</p>
                  <p className="text-xs text-white/75">{s.label}</p>
                </div>
              </li>
            )
          })}
        </ul>
      </Container>
    </section>
  )
}

// --- Industries ----------------------------------------------------------------------------------------
export function Industries() {
  return (
    <section aria-labelledby="industries-title" id="solutions" className="scroll-mt-20 bg-white py-14 sm:py-16">
      <Container>
        <SectionHeading id="industries-title" title="Perfect for Every Type of Business" subtitle="Used by thousands of business owners across different industries." />
        <ul className="lp-scroll -mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 lg:grid-cols-5">
          {INDUSTRIES.map((i) => (
            <li key={i.title} className="group w-56 shrink-0 snap-start overflow-hidden rounded-2xl border border-lp-line bg-white shadow-lp-card transition hover:-translate-y-0.5 hover:shadow-lp-float sm:w-auto">
              <div className="overflow-hidden">
                <img src={i.image} alt={i.alt} loading="lazy" className="aspect-[14/9] w-full object-cover transition duration-300 group-hover:scale-105" />
              </div>
              <div className="p-3.5">
                <h3 className="text-sm font-bold text-lp-ink">{i.title}</h3>
                <p className="mt-0.5 text-xs text-lp-body">{i.text}</p>
              </div>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  )
}

// --- Pricing -------------------------------------------------------------------------------------------
export function Pricing({ planHref }: { planHref: string }) {
  const [yearly, setYearly] = useState(false)
  return (
    <section aria-labelledby="pricing-title" id="pricing" className="scroll-mt-20 bg-lp-pale py-14 sm:py-16">
      <Container>
        <div className="mb-8 flex flex-col gap-4 sm:mb-10 lg:flex-row lg:items-end lg:justify-between">
          <div className="text-center lg:text-left">
            <h2 id="pricing-title" className="text-2xl font-extrabold tracking-tight text-lp-ink sm:text-[2rem] sm:leading-tight">Flexible Plans for Every Business</h2>
            <p className="mt-2 text-sm text-lp-body sm:text-base">Choose a plan that fits your business needs. All plans include core features.</p>
          </div>
          <div role="radiogroup" aria-label="Billing period" className="mx-auto inline-flex items-center rounded-full border border-lp-line bg-white p-1 shadow-sm lg:mx-0">
            {[{ v: false, label: 'Monthly' }, { v: true, label: 'Yearly' }].map((o) => (
              <button key={o.label} type="button" role="radio" aria-checked={yearly === o.v} onClick={() => setYearly(o.v)}
                className={cn('flex items-center gap-1.5 rounded-full px-5 py-2 text-sm font-semibold transition', yearly === o.v ? 'bg-lp-primary text-white shadow' : 'text-lp-ink hover:text-lp-primary')}>
                {o.label}
                {o.v && PRICING.yearlyBadge && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-lp-green">{PRICING.yearlyBadge}</span>}
              </button>
            ))}
          </div>
        </div>
        <ul className="grid items-start gap-5 md:grid-cols-3">
          {PRICING.plans.map((p) => (
            <li key={p.key} className={cn(
              'relative flex h-full flex-col rounded-2xl bg-white p-6 transition',
              p.popular ? 'border-2 border-lp-primary shadow-[0_18px_40px_-18px_rgb(8_102_245/0.55)] md:-mt-3 md:pb-9' : 'border border-lp-line shadow-lp-card',
            )}>
              {p.popular && (
                <span className="absolute -top-px left-1/2 -translate-x-1/2 rounded-b-lg bg-lp-primary px-4 py-1 text-[11px] font-semibold tracking-wide text-white">Most Popular</span>
              )}
              <h3 className={cn('text-lg font-bold text-lp-ink', p.popular && 'mt-3')}>{p.name}</h3>
              <p className="text-[13px] text-lp-body">{p.tagline}</p>
              <p className="mt-4 flex items-baseline gap-1" aria-live="polite">
                {yearly ? (
                  <span className="text-base font-semibold text-lp-ink">Yearly price shown at checkout</span>
                ) : (
                  <>
                    <span className="text-[2.2rem] leading-none font-extrabold text-lp-ink">{p.monthly}</span>
                    <span className="text-sm text-lp-body">/month</span>
                  </>
                )}
              </p>
              <ul className="mt-5 flex-1 space-y-2.5">
                {p.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-[13px] text-lp-ink"><Check className="size-4 shrink-0 text-lp-primary" strokeWidth={3} aria-hidden /> {f}</li>
                ))}
              </ul>
              <Link to={planHref} aria-label={`Choose the ${p.name} plan`}
                className={cn('mt-6 rounded-xl py-3 text-center text-sm font-semibold transition', p.popular ? ctaPrimary : 'border border-lp-primary text-lp-primary hover:bg-lp-primary hover:text-white')}>
                Choose Plan
              </Link>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  )
}

// --- Testimonials -----------------------------------------------------------------------------------
export function Testimonials() {
  return (
    <section aria-labelledby="testimonials-title" className="bg-white py-14 sm:py-16">
      <Container>
        <SectionHeading id="testimonials-title" title="What Our Customers Say" subtitle="Trusted by thousands of business owners." />
        <ul className="grid gap-5 md:grid-cols-3">
          {TESTIMONIALS.items.map((t) => (
            <li key={t.name}>
              <figure className="flex h-full flex-col rounded-2xl border border-lp-line bg-white p-5 shadow-lp-card">
                <div className="flex items-center gap-3">
                  <span className="flex size-11 items-center justify-center rounded-full bg-lp-sky text-sm font-bold text-lp-primary" aria-hidden>{initials(t.name)}</span>
                  <span className="flex gap-0.5" role="img" aria-label="Rated 5 out of 5">
                    {Array.from({ length: 5 }, (_, i) => <Star key={i} className="size-4 fill-amber-400 text-amber-400" aria-hidden />)}
                  </span>
                </div>
                <blockquote className="mt-3 flex-1 text-[13px] leading-relaxed text-lp-body">“{t.quote}”</blockquote>
                <figcaption className="mt-4 border-t border-lp-line pt-3">
                  <p className="text-sm font-bold text-lp-ink">{t.name}</p>
                  <p className="text-xs text-lp-body">{t.role}</p>
                </figcaption>
              </figure>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  )
}

// --- FAQ --------------------------------------------------------------------------------------------------
function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  return (
    <li className="rounded-xl border border-lp-line bg-white">
      <h3>
        <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left text-sm font-semibold text-lp-ink hover:text-lp-primary">
          {q}
          {open ? <Minus className="size-4 shrink-0 text-lp-primary" aria-hidden /> : <Plus className="size-4 shrink-0 text-lp-body" aria-hidden />}
        </button>
      </h3>
      <div id={id} hidden={!open} className="px-4 pb-4 text-[13px] leading-relaxed text-lp-body">{a}</div>
    </li>
  )
}

export function Faq() {
  return (
    <section aria-labelledby="faq-title" id="faq" className="scroll-mt-20 bg-white pb-14 sm:pb-16">
      <Container>
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 id="faq-title" className="text-2xl font-extrabold tracking-tight text-lp-ink sm:text-[2rem] sm:leading-tight">Frequently Asked Questions</h2>
            <p className="mt-2 text-sm text-lp-body sm:text-base">Find answers to common questions about myEcatalogues.</p>
          </div>
          <Link to="/app/support" className="rounded-xl border border-lp-primary px-5 py-2.5 text-sm font-semibold text-lp-primary transition hover:bg-lp-primary hover:text-white">View All FAQs</Link>
        </div>
        <ul className="grid items-start gap-3 md:grid-cols-2">
          {FAQS.map((f) => <FaqItem key={f.q} {...f} />)}
        </ul>
      </Container>
    </section>
  )
}

// --- Final CTA -----------------------------------------------------------------------------------------
export function FinalCta({ ctaHref }: { ctaHref: string }) {
  return (
    <section aria-labelledby="cta-title" className="bg-white pb-14 sm:pb-16">
      <Container>
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-lp-navy via-[#0a3d99] to-lp-primary px-6 py-9 sm:px-10">
          <div aria-hidden className="pointer-events-none absolute -top-24 -right-16 size-72 rounded-full bg-white/10" />
          <div aria-hidden className="pointer-events-none absolute -bottom-28 right-40 size-60 rounded-full bg-sky-400/20" />
          <div className="relative flex flex-col items-start gap-6 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 id="cta-title" className="text-2xl font-extrabold text-white sm:text-[1.75rem]">Ready to Showcase Your Products?</h2>
              <p className="mt-1.5 text-sm text-white/80">Join thousands of businesses who are growing with myEcatalogues.</p>
            </div>
            <Link to={ctaHref} className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-white px-6 py-3.5 text-sm font-semibold text-lp-primary shadow-lg transition hover:-translate-y-0.5">
              Create Your Catalogue <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
        </div>
      </Container>
    </section>
  )
}

// --- Footer ------------------------------------------------------------------------------------------------
const SOCIAL_ICONS = { facebook: Facebook, instagram: Instagram, youtube: Youtube, linkedin: Linkedin } as const

export function LandingFooter() {
  return (
    <footer className="border-t border-lp-line bg-white">
      <Container className="grid grid-cols-2 gap-x-6 gap-y-8 py-10 sm:grid-cols-3 md:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))]">
        <div className="col-span-2 sm:col-span-3 md:col-span-1">
          <Logo />
          <p className="mt-3 text-sm font-semibold text-lp-ink">Create. Share. Grow.</p>
          <p className="mt-1 text-xs text-lp-body">Your Business. One Beautiful Catalogue.</p>
          <ul className="mt-4 flex gap-2" aria-label="Social media">
            {(Object.keys(SOCIAL_ICONS) as (keyof typeof SOCIAL_ICONS)[]).map((key) => {
              const Icon = SOCIAL_ICONS[key]
              const href = SOCIAL_LINKS[key]
              const cls = 'flex size-9 items-center justify-center rounded-full bg-lp-pale text-lp-ink ring-1 ring-lp-line'
              return (
                <li key={key}>
                  {href ? (
                    <a href={href} target="_blank" rel="noreferrer" aria-label={key} className={cn(cls, 'hover:bg-lp-primary hover:text-white')}><Icon className="size-4" aria-hidden /></a>
                  ) : (
                    <span className={cn(cls, 'opacity-70')} title="Coming soon"><Icon className="size-4" aria-hidden /><span className="sr-only">{key} (coming soon)</span></span>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
        {FOOTER_COLUMNS.map((col) => (
          <nav key={col.title} aria-label={col.title}>
            <h2 className="text-sm font-bold text-lp-ink">{col.title}</h2>
            <ul className="mt-3 space-y-2 text-[13px] text-lp-body">
              {col.links.map((l) => (
                <li key={l.label}>
                  {l.to ? <Link to={l.to} className="hover:text-lp-primary">{l.label}</Link>
                    : l.href ? <a href={l.href} className="hover:text-lp-primary">{l.label}</a>
                    : <span title="Coming soon">{l.label}</span>}
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </Container>
      <div className="border-t border-lp-line py-4 text-center text-xs text-lp-body">© {new Date().getFullYear()} myEcatalogues. All rights reserved.</div>
    </footer>
  )
}
