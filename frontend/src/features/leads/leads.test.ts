import { afterEach, describe, expect, it, vi } from 'vitest'
import { detectSource } from '@/api/leads'
import { labelIndices, niceMax, percentChange } from '@/components/charts/chartUtils'
import { localISO, presetRange } from '@/features/leads/dateRange'
import { whatsappHref } from '@/features/leads/leadFormat'

describe('chart helpers', () => {
  it('rounds axis maxima up to clean values', () => {
    expect(niceMax(0)).toBe(4)
    expect(niceMax(1)).toBe(1)
    expect(niceMax(7)).toBe(10)
    expect(niceMax(13)).toBe(20)
    expect(niceMax(21)).toBe(25)
    expect(niceMax(26)).toBe(50)
    expect(niceMax(4200)).toBe(5000)
  })

  it('spaces x-axis labels evenly and keeps both ends', () => {
    expect(labelIndices(4)).toEqual([0, 1, 2, 3])
    const idx = labelIndices(30)
    expect(idx).toHaveLength(6)
    expect(idx[0]).toBe(0)
    expect(idx.at(-1)).toBe(29)
  })

  it('reports period-over-period change without dividing by zero', () => {
    expect(percentChange(150, 100)).toBe(50)
    expect(percentChange(50, 100)).toBe(-50)
    expect(percentChange(0, 0)).toBe(0)
    expect(percentChange(5, 0)).toBeNull()
  })
})

describe('date ranges', () => {
  const today = new Date(2026, 9, 18) // 18 Oct 2026, local time

  it('builds inclusive presets in local calendar days', () => {
    expect(presetRange('7', today)).toEqual({ from: '2026-10-12', to: '2026-10-18' })
    expect(presetRange('30', today)).toEqual({ from: '2026-09-19', to: '2026-10-18' })
    expect(presetRange('month', today)).toEqual({ from: '2026-10-01', to: '2026-10-18' })
    expect(presetRange('nonsense', today).from).toBe('2026-09-19')
  })

  it('formats local dates without UTC drift', () => {
    expect(localISO(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
  })
})

describe('traffic source detection', () => {
  afterEach(() => vi.unstubAllGlobals())
  const detect = (search: string, referrer: string) => {
    vi.stubGlobal('window', { location: { hostname: 'app.myecatalogues.test' } })
    return detectSource(search, referrer)
  }

  it('prefers the explicit src parameter', () => {
    expect(detect('?src=qr', 'https://www.google.com/')).toBe('qr_code')
    expect(detect('?src=whatsapp', '')).toBe('whatsapp')
  })

  it('classifies referrers by whole domain labels', () => {
    expect(detect('', '')).toBe('direct')
    expect(detect('', 'https://app.myecatalogues.test/app')).toBe('direct')
    expect(detect('', 'https://www.google.co.in/')).toBe('search')
    expect(detect('', 'https://l.facebook.com/')).toBe('social')
    expect(detect('', 'https://t.co/abc')).toBe('social')
    expect(detect('', 'https://web.whatsapp.com/')).toBe('whatsapp')
    expect(detect('', 'https://box.com/')).toBe('other')
    expect(detect('', 'https://gist.com/')).toBe('other')
    expect(detect('', 'not a url')).toBe('other')
  })
})

describe('contact links', () => {
  it('builds WhatsApp links from digits only', () => {
    expect(whatsappHref('+91 98765-43210')).toMatch(/^https:\/\/wa\.me\/919876543210/)
  })
})
