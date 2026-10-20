import { useState } from 'react'
import type { DonutSegment } from '@/components/charts/chartUtils'
import { cn } from '@/utils/cn'

/** Ring chart with a total in the middle; 2 px surface gaps between segments; hover shows the value. */
export function Donut({
  segments,
  centerValue,
  centerLabel,
  size = 150,
  thickness = 22,
}: {
  segments: DonutSegment[]
  centerValue: string
  centerLabel: string
  size?: number
  thickness?: number
}) {
  const [hover, setHover] = useState<string | null>(null)
  const total = segments.reduce((a, s) => a + s.value, 0)
  const r = (size - thickness) / 2
  const c = 2 * Math.PI * r
  const gap = segments.length > 1 ? 2 : 0
  let offset = 0
  const active = segments.find((s) => s.key === hover)
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="size-full -rotate-90" role="img" aria-label={`${centerLabel}: ${segments.map((s) => `${s.label} ${s.value}`).join(', ')}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#edf2f9" strokeWidth={thickness} />
        {total > 0 &&
          segments.map((s) => {
            const len = (s.value / total) * c
            const dash = Math.max(len - gap, 0.5)
            const el = (
              <circle
                key={s.key}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={hover === s.key ? thickness + 4 : thickness}
                strokeDasharray={`${dash} ${c - dash}`}
                strokeDashoffset={-offset}
                onPointerEnter={() => setHover(s.key)}
                onPointerLeave={() => setHover(null)}
                className="cursor-default transition-[stroke-width]"
              />
            )
            offset += len
            return el
          })}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-[22px] leading-tight font-bold text-ink tabular-nums">{active ? active.value.toLocaleString() : centerValue}</span>
        <span className="max-w-[70%] text-[12px] leading-tight text-body">{active ? active.label : centerLabel}</span>
      </div>
    </div>
  )
}

/** Legend rows: colour dot, label, value and share — identity never relies on colour alone. */
export function DonutLegend({ segments, showCount = true, className }: { segments: DonutSegment[]; showCount?: boolean; className?: string }) {
  const total = segments.reduce((a, s) => a + s.value, 0) || 1
  return (
    <ul className={cn('min-w-0 flex-1 space-y-2.5 text-[13px]', className)}>
      {segments.map((s) => (
        <li key={s.key} className="flex items-center gap-2">
          <span className="size-2.5 shrink-0 rounded-full" style={{ background: s.color }} aria-hidden />
          <span className="min-w-0 flex-1 truncate text-ink">{s.label}</span>
          {showCount && <span className="font-semibold text-ink tabular-nums">{s.value.toLocaleString()}</span>}
          <span className="w-11 text-right text-body tabular-nums">{showCount ? `(${Math.round((s.value / total) * 100)}%)` : `${Math.round((s.value / total) * 100)}%`}</span>
        </li>
      ))}
    </ul>
  )
}
