import { useId, useRef, useState } from 'react'
import { compact, labelIndices, niceMax, shortDate } from '@/components/charts/chartUtils'

const W = 640
const H = 200
const PAD = { top: 12, right: 12, bottom: 26, left: 40 }
const COLOR = '#2f6df6' // reference chart blue — single series, so one hue; text stays in text tokens

export interface TrendPoint {
  date: string
  value: number
}

/**
 * Single-series trend (line or column) with a hover crosshair + tooltip.
 * Two measures with different scales get two charts (small multiples), never a dual axis.
 */
export function TrendChart({
  data,
  kind = 'line',
  label,
  height = H,
  formatDate = shortDate,
  unit = 'day',
  formatValue = (v: number) => v.toLocaleString(),
}: {
  data: TrendPoint[]
  kind?: 'line' | 'column'
  label: string
  height?: number
  formatDate?: (iso: string) => string
  unit?: 'day' | 'month'
  formatValue?: (v: number) => string
}) {
  const ref = useRef<SVGSVGElement>(null)
  const gradientId = useId()
  const [hover, setHover] = useState<number | null>(null)
  const innerW = W - PAD.left - PAD.right
  const innerH = height - PAD.top - PAD.bottom
  const max = niceMax(Math.max(0, ...data.map((d) => d.value)))
  const n = data.length
  const band = innerW / Math.max(n, 1)
  const x = (i: number) => (kind === 'column' ? PAD.left + band * i + band / 2 : PAD.left + (n <= 1 ? innerW / 2 : (innerW * i) / (n - 1)))
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH
  const ticks = [0, max / 2, max]
  const points = data.map((d, i) => `${x(i)},${y(d.value)}`).join(' ')

  const onMove = (e: React.PointerEvent) => {
    const rect = ref.current?.getBoundingClientRect()
    if (!rect || n === 0) return
    const px = ((e.clientX - rect.left) / rect.width) * W
    const i = kind === 'column' ? Math.floor((px - PAD.left) / band) : Math.round(((px - PAD.left) / innerW) * (n - 1))
    setHover(Math.min(Math.max(i, 0), n - 1))
  }

  const active = hover !== null ? data[hover] : null
  const tooltipLeft = hover !== null ? `${(x(hover) / W) * 100}%` : '0'

  return (
    <div className="relative">
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${height}`}
        className="h-auto w-full touch-none select-none"
        role="img"
        aria-label={`${label} per ${unit}`}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={COLOR} stopOpacity="0.14" />
            <stop offset="100%" stopColor={COLOR} stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="#e3e8f0" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            <text x={PAD.left - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" className="fill-slate-500 text-[11px] tabular-nums">
              {compact(t)}
            </text>
          </g>
        ))}
        {labelIndices(n).map((i) => (
          <text key={i} x={x(i)} y={height - 6} textAnchor="middle" className="fill-slate-500 text-[11px]">
            {formatDate(data[i].date)}
          </text>
        ))}
        {kind === 'line' ? (
          <>
            {n > 1 && <polygon points={`${x(0)},${y(0)} ${points} ${x(n - 1)},${y(0)}`} fill={`url(#${gradientId})`} />}
            <polyline points={points} fill="none" stroke={COLOR} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            {hover !== null && (
              <>
                <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + innerH} stroke="#94a3b8" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                <circle cx={x(hover)} cy={y(data[hover].value)} r="5" fill={COLOR} stroke="white" strokeWidth="2" />
              </>
            )}
          </>
        ) : (
          data.map((d, i) => {
            const barW = Math.min(24, band - 4)
            const h = Math.max(0, y(0) - y(d.value))
            const r = Math.min(4, h / 2, barW / 2)
            const bx = x(i) - barW / 2
            const by = y(d.value)
            // Rounded data-end, square at the baseline.
            const path = h === 0 ? '' : `M${bx},${by + h} V${by + r} Q${bx},${by} ${bx + r},${by} H${bx + barW - r} Q${bx + barW},${by} ${bx + barW},${by + r} V${by + h} Z`
            return <path key={d.date} d={path} fill={COLOR} opacity={hover === null || hover === i ? 1 : 0.45} />
          })
        )}
        <line x1={PAD.left} x2={W - PAD.right} y1={y(0)} y2={y(0)} stroke="#cbd5e1" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      </svg>
      {active && (
        <div
          role="status"
          className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-lg border border-border bg-white px-3 py-2 text-xs shadow-lg"
          style={{ left: tooltipLeft }}
        >
          <p className="font-medium text-ink">{formatDate(active.date)}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-muted">
            <span className="inline-block size-2 rounded-full" style={{ background: COLOR }} aria-hidden />
            {label}: <span className="font-semibold text-ink tabular-nums">{formatValue(active.value)}</span>
          </p>
        </div>
      )}
    </div>
  )
}
