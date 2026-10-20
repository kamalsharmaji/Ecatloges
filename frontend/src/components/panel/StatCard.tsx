import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { usePanelVariant } from '@/components/panel/panelVariant'
import { cn } from '@/utils/cn'

// Tile fill / glyph / ornament colours sampled from the UI reference stat cards.
const tones = {
  blue: { tile: 'bg-[#d5e9fd] text-[#085afc]', bar: '#3d8bfd' },
  pink: { tile: 'bg-[#fddaed] text-[#f0107f]', bar: '#f45aa5' },
  violet: { tile: 'bg-[#e8ddfd] text-[#8b2cf5]', bar: '#a974f8' },
  green: { tile: 'bg-[#d9f9e6] text-[#16a34a]', bar: '#3fcf78' },
  amber: { tile: 'bg-[#ffeccf] text-[#f59e0b]', bar: '#fbb040' },
  red: { tile: 'bg-[#fde0e0] text-[#e5252a]', bar: '#f26b6e' },
  slate: { tile: 'bg-slate-100 text-slate-600', bar: '#94a3b8' },
}

/** Decorative ascending bars from the reference cards (not data). */
function Ornament({ color }: { color: string }) {
  const heights = [14, 22, 30, 40]
  return (
    <svg viewBox="0 0 46 42" className="hidden h-[42px] w-[46px] shrink-0 @min-[17rem]:block" aria-hidden>
      {heights.map((h, i) => (
        <rect key={i} x={i * 12} y={42 - h} width="9" height={h} rx="1.5" fill={color} opacity={0.28 + i * 0.18} />
      ))}
    </svg>
  )
}

export function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = 'blue',
  loading = false,
  ornament = true,
  chart,
}: {
  icon: LucideIcon
  label: string
  value: ReactNode
  hint?: ReactNode
  tone?: keyof typeof tones
  loading?: boolean
  ornament?: boolean
  /** Real mini chart (e.g. a sparkline) shown instead of the decorative bars. */
  chart?: ReactNode
}) {
  const t = tones[tone]
  // Super Admin cards in the reference are narrower (six per row) and have no bar ornament.
  const admin = usePanelVariant() === 'admin'
  return (
    <div className={cn('@container flex items-center rounded-2xl bg-white shadow-panel max-sm:flex-col max-sm:items-start max-sm:gap-2 max-sm:p-3', admin ? 'gap-3 px-3.5 py-3.5' : 'gap-4 px-4 py-4')}>
      <span className={cn('flex shrink-0 items-center justify-center rounded-2xl max-sm:size-11', admin ? 'size-14' : 'size-16', t.tile)}>
        <Icon className={admin ? 'size-7' : 'size-8'} strokeWidth={1.9} fill="currentColor" fillOpacity={0.16} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn('text-ink/85', admin ? 'text-[12.5px] leading-tight' : 'text-[13px] leading-snug')}>{label}</p>
        {loading ? (
          <span className="mt-1 block h-7 w-16 animate-pulse rounded bg-slate-100" aria-label="Loading" />
        ) : (
          <p className={cn('leading-tight font-bold text-ink tabular-nums', admin ? 'text-[22px]' : 'text-[24px]')}>{value}</p>
        )}
        {hint && <p className="text-[12.5px] leading-tight text-body">{hint}</p>}
      </div>
      {chart ?? (ornament && !admin && <Ornament color={t.bar} />)}
    </div>
  )
}

export function StatGrid({ children, cols }: { children: ReactNode; cols?: 4 | 5 | 6 }) {
  const n = cols ?? 4
  return (
    <div
      className={cn(
        'mb-4 grid grid-cols-2 gap-3 sm:gap-4',
        n === 4 && 'xl:grid-cols-4',
        n === 5 && 'lg:grid-cols-3 xl:grid-cols-5',
        n === 6 && 'lg:grid-cols-3 2xl:grid-cols-6',
      )}
    >
      {children}
    </div>
  )
}
