import { ChevronRight, LayoutGrid, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { usePanelVariant } from '@/components/panel/panelVariant'
import { cn } from '@/utils/cn'

/** Green filled check used in hero check-lists (reference style). */
export function CheckDot({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={cn('size-[18px] shrink-0', className)} aria-hidden>
      <circle cx="10" cy="10" r="9.5" fill="#12b347" />
      <path d="M5.8 10.3l2.8 2.7 5.6-5.8" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** White icon tile used by page headers. */
export function HeaderIconTile({ icon: Icon, className }: { icon: LucideIcon; className?: string }) {
  return (
    <span className={cn('flex size-16 shrink-0 items-center justify-center rounded-2xl bg-white text-brand-700 shadow-[0_6px_16px_-10px_rgb(5_102_245/0.6)]', className)}>
      <Icon className="size-8" strokeWidth={1.8} aria-hidden />
    </span>
  )
}

/**
 * Page header from the UI reference.
 * Business panel: light-blue hero banner with icon tile, title, description, illustration, check-list and CTA.
 * Super Admin panel (or `compact`): breadcrumb + icon tile + title + one-line description, actions on the right.
 */
export function PageHero({
  icon,
  title,
  description,
  highlights = [],
  action,
  illustration,
  compact = false,
  breadcrumb,
}: {
  icon: LucideIcon
  title: string
  description: ReactNode
  highlights?: string[]
  action?: ReactNode
  /** Decorative artwork shown between the text and the check-list (hidden below xl). */
  illustration?: string
  compact?: boolean
  /** Breadcrumb trail before the page title (defaults to "Super Admin" in the admin panel). */
  breadcrumb?: { label: string }[]
}) {
  const variant = usePanelVariant()
  if (variant === 'admin' || compact) {
    const trail = breadcrumb ?? (variant === 'admin' ? [{ label: 'Super Admin' }] : [])
    return (
      <section className="mb-4">
        {trail.length > 0 && (
          <nav aria-label="Breadcrumb" className="mb-2 flex items-center gap-2 pl-1 text-[13px] text-body">
            <LayoutGrid className="size-4 text-brand-700" aria-hidden />
            {trail.map((t) => (
              <span key={t.label} className="flex items-center gap-2">
                {t.label}
                <ChevronRight className="size-3.5" aria-hidden />
              </span>
            ))}
            <span className="font-medium text-ink">{title}</span>
          </nav>
        )}
        <div className="flex flex-wrap items-center gap-4">
          <HeaderIconTile icon={icon} />
          <div className="min-w-0 flex-1">
            <h1 className="text-[26px] leading-tight font-bold tracking-tight text-ink">{title}</h1>
            <p className="mt-0.5 text-[15px] text-body">{description}</p>
          </div>
          {action && <div className="flex shrink-0 flex-wrap items-center gap-2.5">{action}</div>}
        </div>
      </section>
    )
  }
  return (
    <section className="relative mb-4 overflow-hidden rounded-2xl bg-[linear-gradient(100deg,#d4eafe_0%,#c6e3fe_42%,#b3d7fd_100%)] px-4 py-4 sm:px-5">
      <div aria-hidden className="pointer-events-none absolute -top-24 left-1/3 size-72 rounded-full bg-white/30 blur-3xl" />
      <div className="relative flex flex-col gap-4 lg:min-h-[104px] lg:flex-row lg:items-center">
        <HeaderIconTile icon={icon} />
        <div className="min-w-0 flex-1 lg:flex-[1_0_400px] lg:max-w-[470px]">
          <h1 className="text-[30px] leading-tight font-bold tracking-tight text-ink sm:text-[34px]">{title}</h1>
          <p className="mt-1 text-[15px] leading-snug text-body">{description}</p>
        </div>
        {illustration ? (
          <img
            src={illustration}
            alt=""
            aria-hidden
            className="pointer-events-none hidden h-[124px] w-auto max-w-[360px] min-w-0 shrink object-contain object-bottom xl:-my-4 xl:ml-auto xl:block xl:[mask-image:linear-gradient(90deg,transparent,black_14%,black_88%,transparent)]"
          />
        ) : (
          <div className="hidden flex-1 xl:block" />
        )}
        {highlights.length > 0 && (
          <ul className="hidden shrink-0 space-y-1.5 rounded-xl bg-white/45 px-4 py-3 text-[13.5px] text-ink backdrop-blur-sm 2xl:block">
            {highlights.map((h) => (
              <li key={h} className="flex items-center gap-2">
                <CheckDot /> {h}
              </li>
            ))}
          </ul>
        )}
        {action && <div className="shrink-0 lg:pl-2">{action}</div>}
      </div>
    </section>
  )
}
