import { describe, expect, it } from 'vitest'
import { shortMonth } from '@/components/charts/chartUtils'

describe('month labels for platform charts', () => {
  it('uses the calendar month from the ISO date without timezone drift', () => {
    const expected = new Intl.DateTimeFormat(undefined, { month: 'short' }).format(new Date(2026, 9, 1))
    expect(shortMonth('2026-10-01')).toBe(expected)
    expect(shortMonth('2026-01-01')).toBe(new Intl.DateTimeFormat(undefined, { month: 'short' }).format(new Date(2026, 0, 1)))
  })
})
