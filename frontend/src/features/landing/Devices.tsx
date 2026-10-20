import { ArrowRight, Heart, LampDesk, LayoutGrid, Menu, Search, Sparkles, Armchair } from 'lucide-react'
import type { ReactNode } from 'react'
import heroRoom from '@/assets/landing/hero-living-room.jpg'
import blackChair from '@/assets/landing/product-black-chair.jpg'
import lamp from '@/assets/landing/product-floor-lamp.jpg'
import greenSofa from '@/assets/landing/product-green-sofa.jpg'
import leatherSofa from '@/assets/landing/product-leather-sofa.jpg'
import pendant from '@/assets/landing/product-pendant-lamp.jpg'
import whiteChair from '@/assets/landing/product-white-chair.jpg'
import woodenChair from '@/assets/landing/product-wooden-chair.jpg'
import resort from '@/assets/landing/showcase-resort-loungers.jpg'
import { cn } from '@/utils/cn'

/* Everything inside the devices is illustration: hidden from assistive tech, labelled once on the frame. */

const CATEGORIES = [
  { label: 'All', icon: LayoutGrid },
  { label: 'Chairs', icon: Armchair },
  { label: 'Lamps', icon: LampDesk },
  { label: 'Decor', icon: Sparkles },
]

const PRODUCTS = [
  { name: 'Wooden Chair', price: '₹2,499', image: woodenChair },
  { name: 'Floor Lamp', price: '₹1,299', image: lamp },
  { name: 'Velvet Sofa', price: '₹24,999', image: greenSofa },
  { name: 'Lounge Chair', price: '₹4,999', image: blackChair },
  { name: 'Accent Chair', price: '₹3,499', image: whiteChair },
  { name: 'Pendant Lamp', price: '₹1,899', image: pendant },
  { name: 'Leather Sofa', price: '₹32,999', image: leatherSofa },
]

function MiniBrand({ className }: { className?: string }) {
  return (
    <span className={cn('font-extrabold tracking-tight text-lp-ink', className)}>
      my<span className="text-lp-primary">E</span>catalogues
    </span>
  )
}

function ProductCard({ product, compact = false }: { product: (typeof PRODUCTS)[number]; compact?: boolean }) {
  return (
    <div className="overflow-hidden rounded-lg bg-white shadow-[0_2px_8px_-4px_rgb(16_42_99/0.25)] ring-1 ring-lp-line">
      <img src={product.image} alt="" loading="lazy" className="aspect-square w-full object-cover" />
      <div className={cn('flex items-end justify-between', compact ? 'p-1' : 'p-1.5')}>
        <div className="min-w-0">
          <p className={cn('truncate font-semibold text-lp-ink', compact ? 'text-[5px]' : 'text-[8px]')}>{product.name}</p>
          <p className={cn('font-bold text-lp-primary', compact ? 'text-[5px]' : 'text-[8px]')}>{product.price}</p>
        </div>
        <Heart className={cn('shrink-0 text-lp-body', compact ? 'size-1.5' : 'size-2.5')} aria-hidden />
      </div>
    </div>
  )
}

/** The catalogue as it looks on a phone (used in the hero and the device showcase). */
export function PhoneScreen({ scale = 'md' }: { scale?: 'md' | 'sm' }) {
  const sm = scale === 'sm'
  return (
    <div className="flex h-full flex-col bg-lp-pale">
      <div className={cn('flex shrink-0 items-center justify-between bg-white', sm ? 'px-1.5 pt-3 pb-1' : 'px-3 pt-6 pb-2')}>
        <MiniBrand className={sm ? 'text-[6px]' : 'text-[11px]'} />
        <span className="flex gap-1.5 text-lp-ink">
          <Search className={sm ? 'size-1.5' : 'size-3'} aria-hidden />
          <Menu className={sm ? 'size-1.5' : 'size-3'} aria-hidden />
        </span>
      </div>
      <div className={cn('relative shrink-0 overflow-hidden', sm ? 'mx-1 mt-1 rounded-md' : 'mx-2.5 mt-2 rounded-xl')}>
        <img src={heroRoom} alt="" className={cn('w-full object-cover', sm ? 'h-12' : 'h-32')} />
        <div className="absolute inset-0 bg-gradient-to-r from-lp-navy/80 via-lp-navy/35 to-transparent" />
        <div className={cn('absolute inset-y-0 left-0 flex flex-col justify-center text-white', sm ? 'px-1.5' : 'px-3')}>
          <p className={cn('leading-tight font-bold', sm ? 'text-[7px]' : 'text-[15px]')}>Premium<br />Collection</p>
          <p className={cn('mt-0.5 text-white/80', sm ? 'text-[4px]' : 'text-[7px]')}>Trendy Products<br />For Modern Living</p>
          <span className={cn('mt-1 inline-flex w-fit items-center gap-0.5 rounded-full bg-white font-semibold text-lp-primary', sm ? 'px-1 py-px text-[4px]' : 'px-2 py-0.5 text-[7px]')}>
            View Products <ArrowRight className={sm ? 'size-1' : 'size-2'} aria-hidden />
          </span>
        </div>
      </div>
      <div className={cn('flex shrink-0 justify-around', sm ? 'px-1 pt-1.5' : 'px-3 pt-3')}>
        {CATEGORIES.map(({ label, icon: Icon }, i) => (
          <span key={label} className="flex flex-col items-center gap-0.5">
            <span className={cn('flex items-center justify-center rounded-full', i === 0 ? 'bg-lp-primary text-white' : 'bg-white text-lp-orange ring-1 ring-lp-line', sm ? 'size-3' : 'size-6')}>
              <Icon className={sm ? 'size-1.5' : 'size-3'} aria-hidden />
            </span>
            <span className={cn(i === 0 ? 'font-semibold text-lp-primary' : 'text-lp-body', sm ? 'text-[4px]' : 'text-[7px]')}>{label}</span>
          </span>
        ))}
      </div>
      <div className={cn('grid grid-cols-2', sm ? 'gap-1 p-1' : 'gap-2 p-2.5')}>
        {PRODUCTS.slice(0, sm ? 2 : 4).map((p) => <ProductCard key={p.name} product={p} compact={sm} />)}
      </div>
    </div>
  )
}

/** Realistic phone frame: thin dark bezel, rounded corners, notch, glass reflection, soft shadow. */
export function PhoneFrame({ children, className, label }: { children: ReactNode; className?: string; label?: string }) {
  return (
    // No position class here: callers place the frame (absolute in mockups); the screen below is the positioning context.
    <div role={label ? 'img' : undefined} aria-label={label} className={cn('rounded-[2.4rem] bg-slate-900 p-[7px] shadow-lp-device ring-1 ring-slate-700', className)}>
      <div className="relative h-full overflow-hidden rounded-[1.95rem] bg-white" aria-hidden>
        {children}
        <span className="absolute top-1.5 left-1/2 h-3.5 w-16 -translate-x-1/2 rounded-full bg-slate-900" />
        <span className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/25 via-transparent to-transparent" />
      </div>
    </div>
  )
}

/** Wide catalogue layout for the laptop and tablet screens. */
function WideScreen({ columns, compact = false }: { columns: number; compact?: boolean }) {
  return (
    <div className="flex h-full flex-col bg-white">
      <div className="flex items-center justify-between border-b border-lp-line px-2.5 py-1.5">
        <MiniBrand className="text-[8px]" />
        <span className="hidden h-2.5 w-24 rounded-full bg-lp-pale ring-1 ring-lp-line sm:block" />
        <span className="flex gap-1.5 text-lp-ink"><Search className="size-2.5" aria-hidden /><Menu className="size-2.5" aria-hidden /></span>
      </div>
      <div className={cn('relative shrink-0 overflow-hidden rounded-md', compact ? 'mx-1.5 mt-1.5' : 'mx-2 mt-2')}>
        <img src={resort} alt="" className={cn('w-full object-cover', compact ? 'h-11' : 'h-20 sm:h-24')} />
        <div className="absolute inset-0 bg-gradient-to-r from-lp-navy/70 via-lp-navy/20 to-transparent" />
        <div className={cn('absolute inset-y-0 left-0 flex flex-col justify-center text-white', compact ? 'px-2' : 'px-3')}>
          <p className={cn('leading-tight font-bold', compact ? 'text-[8px]' : 'text-[13px]')}>Summer<br />Collection</p>
          <span className={cn('mt-0.5 w-fit rounded-full bg-white font-semibold text-lp-primary', compact ? 'px-1 text-[4px]' : 'px-1.5 py-px text-[6px]')}>Shop Now</span>
        </div>
      </div>
      <div className={cn('flex gap-1', compact ? 'mx-1.5 mt-1' : 'mx-2 mt-1.5')}>
        {['All', 'Chairs', 'Sofas', 'Lamps', 'Decor'].map((c, i) => (
          <span key={c} className={cn('rounded-full px-1.5 py-px text-[6px]', i === 0 ? 'bg-lp-primary text-white' : 'bg-lp-pale text-lp-body')}>{c}</span>
        ))}
      </div>
      <div className="grid gap-1.5 p-2" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {PRODUCTS.slice(2, 2 + columns).map((p) => <ProductCard key={p.name} product={p} compact />)}
      </div>
    </div>
  )
}

export function LaptopMockup({ className }: { className?: string }) {
  return (
    <div className={cn('relative', className)}>
      <div className="rounded-t-xl bg-slate-900 p-[6px] shadow-lp-device ring-1 ring-slate-700">
        <div className="aspect-[16/10] overflow-hidden rounded-md">
          <WideScreen columns={5} />
        </div>
      </div>
      <div className="relative mx-[-6%] h-3 rounded-b-xl bg-gradient-to-b from-slate-300 to-slate-400 shadow-md">
        <span className="absolute top-0 left-1/2 h-1 w-16 -translate-x-1/2 rounded-b bg-slate-500/60" />
      </div>
    </div>
  )
}

export function TabletMockup({ className }: { className?: string }) {
  return (
    <div className={cn('rounded-[1.1rem] bg-slate-900 p-[6px] shadow-lp-device ring-1 ring-slate-700', className)}>
      <div className="aspect-[4/3] overflow-hidden rounded-[0.7rem]">
        <WideScreen columns={3} compact />
      </div>
    </div>
  )
}
