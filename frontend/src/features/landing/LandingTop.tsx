import {
  ArrowRight,
  Building2,
  ChartColumn,
  ChevronRight,
  CircleCheck,
  Factory,
  Hotel,
  ImagePlus,
  Images,
  Layers,
  LayoutGrid,
  Menu,
  MessageCircle,
  Monitor,
  Play,
  QrCode,
  Share2,
  Shirt,
  Sofa,
  Store,
  UserRound,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import qrSample from '@/assets/landing/qr-sample.svg'
import { Logo } from '@/components/Logo'
import { cn } from '@/utils/cn'
import { DEVICE_BENEFITS, FEATURES, HERO, STEPS } from './content'
import { LaptopMockup, PhoneFrame, PhoneScreen, TabletMockup } from './Devices'
import { ctaPrimary, NAV_LINKS } from './links'

export function Container({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('mx-auto w-full max-w-6xl px-4 sm:px-6', className)}>{children}</div>
}

export function SectionHeading({ id, title, subtitle, align = 'center' }: { id?: string; title: string; subtitle?: string; align?: 'center' | 'left' }) {
  return (
    <div className={cn('mb-8 sm:mb-10', align === 'center' && 'text-center')}>
      <h2 id={id} className="text-2xl font-extrabold tracking-tight text-lp-ink sm:text-[2rem] sm:leading-tight">{title}</h2>
      {subtitle && <p className="mt-2 text-sm text-lp-body sm:text-base">{subtitle}</p>}
    </div>
  )
}

// --- Header -----------------------------------------------------------------------------------------
export function LandingHeader({ signedIn }: { signedIn: boolean }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <header className="sticky top-0 z-40 border-b border-lp-line/70 bg-white/90 backdrop-blur">
      <Container className="flex h-16 items-center justify-between">
        <a href="#top" aria-label="myEcatalogues home"><Logo /></a>
        <div ref={ref} className="relative flex items-center gap-2 sm:gap-3">
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="landing-menu"
            aria-label={open ? 'Close menu' : 'Open menu'} className="rounded-lg p-2 text-lp-ink hover:bg-lp-pale">
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
          <Link to={signedIn ? '/businesses' : '/login'}
            className="rounded-xl border border-lp-primary px-5 py-2 text-sm font-semibold text-lp-primary transition hover:bg-lp-primary hover:text-white">
            {signedIn ? 'Dashboard' : 'Login'}
          </Link>
          {open && (
            <nav id="landing-menu" aria-label="Landing page" className="absolute top-12 right-0 w-56 rounded-2xl border border-lp-line bg-white p-2 shadow-lp-float">
              {NAV_LINKS.map((l) => (
                <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2 text-sm font-medium text-lp-ink hover:bg-lp-pale">{l.label}</a>
              ))}
              <Link to={signedIn ? '/businesses' : '/register'} onClick={() => setOpen(false)} className="mt-1 block rounded-lg bg-lp-primary px-3 py-2 text-center text-sm font-semibold text-white">
                {signedIn ? 'Go to dashboard' : 'Create Your Catalogue'}
              </Link>
            </nav>
          )}
        </div>
      </Container>
    </header>
  )
}

// --- Hero ----------------------------------------------------------------------------------------------
function FloatingCard({ icon: Icon, tone, children, className }: { icon: LucideIcon; tone: string; children: ReactNode; className: string }) {
  return (
    <div className={cn('absolute z-10 flex items-center gap-2 rounded-xl bg-white p-2 pr-3 shadow-lp-float ring-1 ring-lp-line/70', className)}>
      <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-lg sm:size-8', tone)}><Icon className="size-4" aria-hidden /></span>
      <span className="text-[10px] leading-tight font-semibold text-lp-ink sm:text-xs">{children}</span>
    </div>
  )
}

export function Hero({ ctaHref }: { ctaHref: string }) {
  return (
    <section aria-labelledby="hero-title" className="relative overflow-hidden bg-gradient-to-b from-white via-white to-lp-sky">
      {/* Soft blue backdrop shapes */}
      <div aria-hidden className="pointer-events-none absolute top-10 -right-40 size-[38rem] rounded-full bg-[radial-gradient(circle,rgb(22_119_255/0.22),transparent_65%)]" />
      <div aria-hidden className="pointer-events-none absolute -bottom-40 -left-32 size-[26rem] rounded-full bg-[radial-gradient(circle,rgb(56_189_248/0.14),transparent_65%)]" />
      <Container className="relative grid items-center gap-10 pt-10 pb-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-6 lg:pt-14 lg:pb-20">
        <div>
          <p className="inline-flex rounded-full border border-lp-line bg-white px-3 py-1 text-xs font-semibold text-lp-ink shadow-sm">{HERO.eyebrow}</p>
          <h1 id="hero-title" className="mt-4 text-[2.15rem] leading-[1.08] font-extrabold tracking-tight text-lp-ink sm:text-5xl lg:text-[3.15rem]">
            {HERO.title} <span className="text-lp-primary">{HERO.highlight}</span>
          </h1>
          <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-lp-body">{HERO.description}</p>
          <div className="mt-7 flex max-w-sm flex-col gap-3">
            <Link to={ctaHref} className={ctaPrimary}>Create Your Catalogue <ArrowRight className="size-4" aria-hidden /></Link>
            <a href="#how-it-works" className="inline-flex items-center justify-center gap-2 rounded-xl border border-lp-primary/40 bg-white px-6 py-3.5 text-sm font-semibold text-lp-primary transition hover:border-lp-primary hover:bg-lp-pale">
              <span className="flex size-6 items-center justify-center rounded-full bg-lp-primary" aria-hidden>
                <Play className="ml-0.5 size-3 fill-white text-white" />
              </span>
              Watch Demo
            </a>
          </div>
          <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-lp-body">
            {HERO.trust.map((t) => (
              <li key={t} className="flex items-center gap-1.5"><CircleCheck className="size-4 fill-lp-primary text-white" aria-hidden /> {t}</li>
            ))}
          </ul>
        </div>

        <div className="relative mx-auto h-[480px] w-full max-w-[360px] sm:h-[560px] sm:max-w-[470px]">
          <div aria-hidden className="absolute inset-x-6 top-12 bottom-6 rounded-full bg-[radial-gradient(circle,rgb(8_102_245/0.30),rgb(22_119_255/0.08)_60%,transparent_72%)]" />
          <PhoneFrame label="A myEcatalogues product catalogue shown on a smartphone"
            className="absolute top-2 left-1/2 h-[460px] w-[226px] -translate-x-1/2 rotate-[3deg] sm:h-[540px] sm:w-[266px]">
            <PhoneScreen />
          </PhoneFrame>
          {/* On phones the cards sit at the device's corners so they don't cover the catalogue. */}
          <FloatingCard icon={Images} tone="bg-lp-sky text-lp-primary" className="top-0 left-0 animate-lp-float sm:top-6">HD Photos<br />&amp; Videos</FloatingCard>
          <FloatingCard icon={QrCode} tone="bg-violet-50 text-lp-purple" className="top-12 right-0 animate-lp-float-slow sm:top-16">Share via<br />QR Code</FloatingCard>
          <FloatingCard icon={MessageCircle} tone="bg-emerald-50 text-lp-green" className="bottom-16 left-0 animate-lp-float-slow sm:top-[46%] sm:bottom-auto">WhatsApp<br />Enquiries</FloatingCard>
          <FloatingCard icon={ChartColumn} tone="bg-sky-50 text-lp-secondary" className="right-0 bottom-4 animate-lp-float sm:top-[38%] sm:bottom-auto">Track Views<br />&amp; Sales</FloatingCard>
        </div>
      </Container>
    </section>
  )
}

// --- Business category strip --------------------------------------------------------------------------
const CATEGORY_STRIP: { label: string; icon: LucideIcon; tone: string }[] = [
  { label: 'Retail Shops', icon: Store, tone: 'bg-pink-50 text-pink-500' },
  { label: 'Showrooms', icon: Building2, tone: 'bg-sky-50 text-lp-primary' },
  { label: 'Fashion', icon: Shirt, tone: 'bg-orange-50 text-lp-orange' },
  { label: 'Electronics', icon: Monitor, tone: 'bg-emerald-50 text-lp-green' },
  { label: 'Hotels', icon: Hotel, tone: 'bg-teal-50 text-teal-600' },
  { label: 'Furniture', icon: Sofa, tone: 'bg-blue-50 text-lp-secondary' },
  { label: 'Manufacturers', icon: Factory, tone: 'bg-indigo-50 text-indigo-500' },
  { label: 'More', icon: LayoutGrid, tone: 'bg-violet-50 text-lp-purple' },
]

export function CategoryStrip() {
  return (
    <section aria-label="Business types" className="border-y border-lp-line/70 bg-white">
      <Container>
        <ul className="lp-scroll -mx-4 flex snap-x gap-2 overflow-x-auto px-4 py-5 sm:mx-0 sm:justify-between sm:px-0">
          {CATEGORY_STRIP.map(({ label, icon: Icon, tone }) => (
            <li key={label} className="flex w-[4.5rem] shrink-0 snap-start flex-col items-center gap-2 text-center sm:w-auto">
              <span className={cn('flex size-12 items-center justify-center rounded-full', tone)}><Icon className="size-5" aria-hidden /></span>
              <span className="text-xs font-medium whitespace-nowrap text-lp-body">{label}</span>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  )
}

// --- Features -----------------------------------------------------------------------------------------
const FEATURE_ICON: Record<(typeof FEATURES)[number]['key'], { icon: LucideIcon; tone: string }> = {
  media: { icon: ImagePlus, tone: 'bg-pink-50 text-pink-500' },
  multi: { icon: Layers, tone: 'bg-emerald-50 text-lp-green' },
  qr: { icon: QrCode, tone: 'bg-violet-50 text-lp-purple' },
  whatsapp: { icon: MessageCircle, tone: 'bg-emerald-50 text-lp-green' },
  analytics: { icon: ChartColumn, tone: 'bg-orange-50 text-lp-orange' },
  team: { icon: Users, tone: 'bg-sky-50 text-lp-primary' },
}

export function Features() {
  return (
    <section aria-labelledby="features-title" id="features" className="scroll-mt-20 bg-white py-14 sm:py-16">
      <Container>
        <SectionHeading id="features-title" title="Everything you need in one powerful platform" subtitle="Simple tools to create, manage and share beautiful product catalogues." />
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5">
          {FEATURES.map((f) => {
            const { icon: Icon, tone } = FEATURE_ICON[f.key]
            return (
              <li key={f.key} className="flex gap-4 rounded-2xl border border-lp-line bg-white p-5 shadow-lp-card transition hover:-translate-y-0.5 hover:shadow-lp-float">
                <span className={cn('flex size-14 shrink-0 items-center justify-center rounded-2xl', tone)}><Icon className="size-7" aria-hidden /></span>
                <div>
                  <h3 className="text-[15px] font-bold text-lp-ink">{f.title}</h3>
                  <p className="mt-1 text-[13px] leading-relaxed text-lp-body">{f.text}</p>
                </div>
              </li>
            )
          })}
        </ul>
      </Container>
    </section>
  )
}

// --- How it works ---------------------------------------------------------------------------------------
const STEP_ICONS = [UserRound, ImagePlus, Share2]

export function HowItWorks() {
  return (
    <section aria-labelledby="how-title" id="how-it-works" className="scroll-mt-20 bg-white pb-14 sm:pb-16">
      <Container>
        <SectionHeading id="how-title" title="How It Works" subtitle="Create your digital product catalogue in just a few simple steps." />
        <ol className="grid gap-6 md:grid-cols-[1fr_auto_1fr_auto_1fr] md:items-start md:gap-3">
          {STEPS.map((s, i) => {
            const Icon = STEP_ICONS[i]!
            return [
              <li key={s.title} className="flex items-start gap-4 md:flex-col md:items-center md:text-center">
                <div className="flex shrink-0 items-center gap-3 md:gap-4">
                  <span className="flex size-10 items-center justify-center rounded-full bg-lp-primary text-base font-bold text-white shadow-[0_8px_18px_-8px_rgb(8_102_245/0.8)]">{i + 1}</span>
                  <span className="flex size-14 items-center justify-center rounded-2xl bg-lp-pale text-lp-primary ring-1 ring-lp-line"><Icon className="size-7" aria-hidden /></span>
                </div>
                <div>
                  <h3 className="text-[15px] font-bold text-lp-ink">{s.title}</h3>
                  <p className="mt-1 max-w-60 text-[13px] leading-relaxed text-lp-body">{s.text}</p>
                </div>
              </li>,
              i < STEPS.length - 1 && (
                <li key={`arrow-${i}`} aria-hidden className="hidden pt-7 text-lp-primary md:block"><ChevronRight className="size-6" /></li>
              ),
            ]
          })}
        </ol>
      </Container>
    </section>
  )
}

// --- Multi-device showcase ----------------------------------------------------------------------------
export function DeviceShowcase() {
  return (
    <section aria-labelledby="devices-title" className="relative overflow-hidden bg-gradient-to-br from-lp-sky via-white to-lp-sky py-14 sm:py-16">
      <div aria-hidden className="pointer-events-none absolute top-1/2 right-0 size-[34rem] -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgb(56_189_248/0.22),transparent_65%)]" />
      <Container className="relative grid items-center gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div>
          <SectionHeading id="devices-title" align="left" title="Beautiful Catalogues on All Devices"
            subtitle="Your catalogue looks amazing on mobile, tablet and desktop. Fast, modern and easy to use for your customers." />
          <ul className="-mt-4 space-y-2.5">
            {DEVICE_BENEFITS.map((b) => (
              <li key={b} className="flex items-center gap-2 text-sm font-medium text-lp-ink"><CircleCheck className="size-5 fill-lp-primary text-white" aria-hidden /> {b}</li>
            ))}
          </ul>
        </div>
        <div role="img" aria-label="The same catalogue shown on a laptop, a tablet and a phone" className="relative mx-auto aspect-[16/11] w-full max-w-[560px]">
          <LaptopMockup className="absolute top-0 left-[14%] w-[66%]" />
          <TabletMockup className="absolute bottom-[4%] left-0 w-[38%]" />
          <PhoneFrame className="absolute right-[13%] bottom-0 h-[62%] w-[21%] rounded-[1.4rem] p-[4px] [&>div]:rounded-[1.1rem]">
            <PhoneScreen scale="sm" />
          </PhoneFrame>
          <div className="absolute top-[12%] right-0 w-[24%] rounded-xl bg-white p-2 text-center shadow-lp-float ring-1 ring-lp-line">
            <img src={qrSample} alt="" className="mx-auto aspect-square w-full" />
            <p className="mt-1 text-[9px] leading-tight font-semibold text-lp-primary sm:text-[11px]">Scan to View<br />Our Catalogue</p>
          </div>
        </div>
      </Container>
    </section>
  )
}
