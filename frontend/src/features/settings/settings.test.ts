import { describe, expect, it } from 'vitest'
import { fromLocalInput, toLocalInput } from '@/features/settings/datetime'

describe('announcement schedule conversion', () => {
  it('round-trips a local datetime-local value through ISO', () => {
    const iso = fromLocalInput('2026-10-20T09:30')
    expect(iso).toMatch(/Z$/)
    expect(toLocalInput(iso)).toBe('2026-10-20T09:30')
  })

  it('treats empty and invalid values as "no schedule"', () => {
    expect(fromLocalInput('')).toBeNull()
    expect(fromLocalInput('not a date')).toBeNull()
    expect(toLocalInput(null)).toBe('')
  })

  it('shows an ISO instant in the browser timezone', () => {
    const local = new Date(2026, 0, 5, 23, 45)
    expect(toLocalInput(local.toISOString())).toBe('2026-01-05T23:45')
  })
})
