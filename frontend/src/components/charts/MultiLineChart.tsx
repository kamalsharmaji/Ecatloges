import { useId, useRef, useState } from 'react'
import { compact, labelIndices, niceMax, shortDate } from '@/components/charts/chartUtils'

export interface LineSeries {
  key: string
  label: string
  color: string
  values: number[]
}

const W = 640
const PAD = { top: 14, right: 14, bottom: 28, left: 44 }

/**
 * Two or more counts of the same unit on ONE shared y-axis (as in the reference "Views & Enquiries" card),
 * with dots, an area under the first series, a crosshair and a tooltip listing every series.
 */
export function MultiLineChart({ dates, series, height = 220, label }: { dates: string[]; series: LineSeries[]; height?: number; label: string }) {
  const ref = useRef<SVGSVGElement>(null)
  const gradientId = useId()
  const [hover, setHover] = useState<number | null>(null)
  const n = dates.length
  const innerW = W - PAD.left - PAD.right
  const innerH = height - PAD.top - PAD.bottom
  // Axis top divisible by 4 so the five gridlines land on whole, readable numbers.
  const raw = Math.max(0, ...series.flatMap((s) => s.values))
  const max = raw <= 4 ? 4 : raw <= 8 ? 8 : Math.ceil(niceMax(raw) / 4) * 4
  const x = (i: number) => PAD.left + (n <= 1 ? innerW / 2 : (innerW * i) / (n - 1))
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH
  const ticks = [0, max / 4, max / 2, (3 * max) / 4, max]
  const dotEvery = n > 16 ? Math.ceil(n / 8) : 1

  const onMove = (e: React.PointerEvent) => {
    const rect = ref.current?.getBoundingClientRect()
    if (!rect || n === 0) return
    const px = ((e.clientX - rect.left) / rect.width) * W
    setHover(Math.min(Math.max(Math.round(((px - PAD.left) / innerW) * (n - 1)), 0), n - 1))
  }

  return (
    <div>
      <div className="relative">
        <svg ref={ref} viewBox={`0 0 ${W} ${height}`} className="h-auto w-full touch-none select-none" role="img"
          aria-label={`${label} per day`} onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
          <defs>
            <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={series[0]?.color} stopOpacity="0.22" />
              <stop offset="100%" stopColor={series[0]?.color} stopOpacity="0" />
            </linearGradient>
          </defs>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="#e8eef7" strokeWidth="1" vectorEffect="non-scaling-stroke" />
              <text x={PAD.left - 10} y={y(t)} textAnchor="end" dominantBaseline="middle" className="fill-[#33416b] text-[11px] tabular-nums">{compact(t)}</text>
            </g>
          ))}
          {labelIndices(n).map((i) => (
            <text key={i} x={x(i)} y={height - 8} textAnchor="middle" className="fill-[#33416b] text-[11px]">{shortDate(dates[i]!)}</text>
          ))}
          {series.map((s, si) => {
            const pts = s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')
            return (
              <g key={s.key}>
                {si === 0 && n > 1 && <polygon points={`${x(0)},${y(0)} ${pts} ${x(n - 1)},${y(0)}`} fill={`url(#${gradientId})`} />}
                <polyline points={pts} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                {s.values.map((v, i) => (i % dotEvery === 0 || i === n - 1) && (
                  <circle key={i} cx={x(i)} cy={y(v)} r="4" fill={s.color} stroke="#fff" strokeWidth="2" />
                ))}
              </g>
            )
          })}
          {hover !== null && (
            <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + innerH} stroke="#94a3b8" strokeDasharray="3 3" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          )}
        </svg>
        {hover !== null && (
          <div role="status" className="pointer-events-none absolute top-1 z-10 -translate-x-1/2 rounded-lg border border-border bg-white px-3 py-2 text-xs shadow-lg"
            style={{ left: `${(x(hover) / W) * 100}%` }}>
            <p className="font-semibold text-ink">{shortDate(dates[hover]!)}</p>
            {series.map((s) => (
              <p key={s.key} className="mt-0.5 flex items-center gap-1.5 text-body">
                <span className="inline-block size-2 rounded-full" style={{ background: s.color }} aria-hidden />
                {s.label} <span className="ml-auto pl-3 font-semibold text-ink tabular-nums">{s.values[hover]!.toLocaleString()}</span>
              </p>
            ))}
          </div>
        )}
      </div>
      <ul className="mt-1 flex justify-center gap-6 text-[13px] text-ink">
        {series.map((s) => (
          <li key={s.key} className="flex items-center gap-2"><span className="size-2.5 rounded-full" style={{ background: s.color }} aria-hidden />{s.label}</li>
        ))}
      </ul>
    </div>
  )
}
