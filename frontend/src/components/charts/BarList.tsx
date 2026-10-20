import type { ReactNode } from 'react'

/**
 * Part-to-whole / ranking as labelled horizontal bars (one hue). Every row shows its value and
 * share as text, so identity and magnitude never depend on colour alone.
 */
export function BarList({
  rows,
  empty = 'No data for this period yet.',
}: {
  rows: { key: string; label: ReactNode; value: number; hint?: ReactNode }[]
  empty?: string
}) {
  const total = rows.reduce((sum, r) => sum + r.value, 0)
  const max = Math.max(0, ...rows.map((r) => r.value))
  if (total === 0) return <p className="py-6 text-center text-sm text-muted">{empty}</p>
  return (
    <ul className="space-y-3">
      {rows.map((r) => {
        const pct = Math.round((r.value / total) * 100)
        return (
          <li key={r.key} title={`${r.value.toLocaleString()} (${pct}%)`}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate text-ink">{r.label}</span>
              <span className="shrink-0 tabular-nums text-muted">
                <span className="font-semibold text-ink">{r.value.toLocaleString()}</span> · {pct}%
              </span>
            </div>
            <div className="mt-1.5 h-2 rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-brand-600" style={{ width: `${max ? (r.value / max) * 100 : 0}%` }} />
            </div>
            {r.hint}
          </li>
        )
      })}
    </ul>
  )
}
