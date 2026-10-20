import { dayMonth } from '@/utils/dates'

/** Round an axis maximum up to a clean value (1, 2, 2.5, 5 × 10^n) so ticks are readable. */
export function niceMax(value: number): number {
  if (value <= 0) return 4
  const exp = Math.floor(Math.log10(value))
  const base = 10 ** exp
  for (const step of [1, 2, 2.5, 5, 10]) {
    if (value <= step * base) return step * base
  }
  return 10 * base
}

export function compact(value: number): string {
  return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(value)
}

/** "2026-10-18" → "18 Oct" (reference axis style) without timezone drift (the date is already a local calendar day). */
export function shortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return dayMonth(new Date(y, m - 1, d))
}

const monthFmt = new Intl.DateTimeFormat(undefined, { month: 'short' })

/** "2026-10-01" → "Oct" (month buckets from the API are local calendar months). */
export function shortMonth(iso: string): string {
  const [y, m] = iso.split('-').map(Number)
  return monthFmt.format(new Date(y, m - 1, 1))
}

/** Indices of ~`count` evenly spaced x-axis labels, always including first and last. */
export function labelIndices(length: number, count = 6): number[] {
  if (length <= count) return Array.from({ length }, (_, i) => i)
  const step = (length - 1) / (count - 1)
  return Array.from({ length: count }, (_, i) => Math.round(i * step))
}

/**
 * Categorical slots validated with the dataviz palette checker (light surface; worst CVD pair 7.6 ΔE,
 * so charts using them always show a labelled legend). OTHERS is the neutral fold-in bucket.
 */
export const CATEGORICAL = ['#2f6df6', '#d97b06', '#8b5cf6', '#1d9b4b', '#e0408f']
export const OTHERS = '#94a3b8'

export interface DonutSegment {
  key: string
  label: string
  value: number
  color: string
}

/** Assign categorical colours in fixed order; anything past the palette folds into "Others". */
export function toSegments(rows: { key: string; label: string; count: number }[], max = CATEGORICAL.length): DonutSegment[] {
  const sorted = rows.filter((r) => r.count > 0)
  const head = sorted.slice(0, max)
  const rest = sorted.slice(max).reduce((a, r) => a + r.count, 0)
  const out = head.map((r, i) => ({ key: r.key, label: r.label, value: r.count, color: CATEGORICAL[i]! }))
  if (rest > 0) out.push({ key: 'others', label: 'Others', value: rest, color: OTHERS })
  return out
}

export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null
  return Math.round(((current - previous) / previous) * 100)
}
