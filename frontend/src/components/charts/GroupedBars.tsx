import { useState } from 'react'
import { niceMax } from '@/components/charts/chartUtils'

export interface BarSeries {
  key: string
  label: string
  color: string
  values: number[]
}

const W = 640
const PAD = { top: 12, right: 8, bottom: 26, left: 32 }

/** Grouped columns (same unit, one shared axis) with a hover tooltip and a labelled legend. */
export function GroupedBars({ labels, series, height = 200, label }: { labels: string[]; series: BarSeries[]; height?: number; label: string }) {
  const [hover, setHover] = useState<number | null>(null)
  const innerW = W - PAD.left - PAD.right
  const innerH = height - PAD.top - PAD.bottom
  const raw = Math.max(0, ...series.flatMap((s) => s.values))
  const max = raw <= 4 ? 4 : Math.ceil(niceMax(raw) / 4) * 4
  const band = innerW / Math.max(labels.length, 1)
  const barW = Math.min(18, (band - 16) / series.length - 2)
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH
  const ticks = [0, max / 4, max / 2, (3 * max) / 4, max]
  return (
    <div>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${height}`} className="h-auto w-full" role="img" aria-label={label} onPointerLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="#e8eef7" vectorEffect="non-scaling-stroke" />
              <text x={PAD.left - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" className="fill-[#33416b] text-[11px] tabular-nums">{Math.round(t)}</text>
            </g>
          ))}
          {labels.map((l, i) => {
            const cx = PAD.left + band * i + band / 2
            const groupW = series.length * (barW + 2) - 2
            return (
              <g key={l} onPointerEnter={() => setHover(i)}>
                <rect x={PAD.left + band * i} y={PAD.top} width={band} height={innerH} fill={hover === i ? '#f3f7fd' : 'transparent'} />
                {series.map((s, si) => {
                  const v = s.values[i] ?? 0
                  const h = Math.max(0, y(0) - y(v))
                  const bx = cx - groupW / 2 + si * (barW + 2)
                  const r = Math.min(4, h / 2, barW / 2)
                  const by = y(v)
                  const d = h === 0 ? '' : `M${bx},${by + h} V${by + r} Q${bx},${by} ${bx + r},${by} H${bx + barW - r} Q${bx + barW},${by} ${bx + barW},${by + r} V${by + h} Z`
                  return <path key={s.key} d={d} fill={s.color} />
                })}
                <text x={cx} y={height - 8} textAnchor="middle" className="fill-[#33416b] text-[11px]">{l}</text>
              </g>
            )
          })}
          <line x1={PAD.left} x2={W - PAD.right} y1={y(0)} y2={y(0)} stroke="#cbd5e1" vectorEffect="non-scaling-stroke" />
        </svg>
        {hover !== null && (
          <div role="status" className="pointer-events-none absolute top-1 z-10 -translate-x-1/2 rounded-lg border border-border bg-white px-3 py-2 text-xs shadow-lg"
            style={{ left: `${((PAD.left + band * hover + band / 2) / W) * 100}%` }}>
            <p className="font-semibold text-ink">{labels[hover]}</p>
            {series.map((s) => (
              <p key={s.key} className="mt-0.5 flex items-center gap-1.5 text-body">
                <span className="inline-block size-2 rounded-full" style={{ background: s.color }} aria-hidden />{s.label}
                <span className="ml-auto pl-3 font-semibold text-ink tabular-nums">{s.values[hover]}</span>
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
