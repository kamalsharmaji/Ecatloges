export interface DateRange {
  from: string
  to: string
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Local calendar date (not UTC) — matches the browser timezone sent to the analytics API. */
export const localISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export function presetRange(key: string, today = new Date()): DateRange {
  const back = (days: number) => localISO(new Date(today.getFullYear(), today.getMonth(), today.getDate() - days))
  if (key === 'month') return { from: localISO(new Date(today.getFullYear(), today.getMonth(), 1)), to: localISO(today) }
  const days = Number(key) || 30
  return { from: back(days - 1), to: localISO(today) }
}
