import { describe, expect, it } from 'vitest'
import {
  actionLabel,
  canReply,
  describeChange,
  relativeTime,
  requesterActions,
  STAFF_TRANSITIONS,
  ticketStatusLabel,
} from '@/features/workspace/format'

describe('activity formatting', () => {
  it('labels known and unknown actions', () => {
    expect(actionLabel('enquiry.received')).toBe('Enquiry received')
    expect(actionLabel('catalogue.published')).toBe('Catalogue published')
    expect(actionLabel('product.bulk_publish')).toBe('Product bulk publish')
  })

  it('describes changes without revealing redacted values', () => {
    expect(describeChange('status', { from: 'draft', to: 'published' })).toBe('Status: draft → published')
    expect(describeChange('phone', { from: '[redacted]', to: '[redacted]' })).toBe('Phone changed')
    expect(describeChange('show_prices', { from: true, to: false })).toBe('Show prices: Yes → No')
    expect(describeChange('city', { from: '', to: 'Pune' })).toBe('City: — → Pune')
    expect(describeChange('permissions_added', { from: null, to: ['catalogue.view'] })).toBe('Permissions added: catalogue.view')
  })
})

describe('relative time', () => {
  const now = new Date('2026-10-18T12:00:00Z')
  it('rounds to the nearest sensible unit', () => {
    expect(relativeTime('2026-10-18T11:59:50Z', now)).toBe('just now')
    expect(relativeTime('2026-10-18T11:50:00Z', now)).toMatch(/10 minutes ago/)
    expect(relativeTime('2026-10-18T09:00:00Z', now)).toMatch(/3 hours ago/)
    expect(relativeTime('2026-10-15T12:00:00Z', now)).toMatch(/3 days ago/)
  })
})

describe('ticket status policy (mirrors the server)', () => {
  it('lets requesters close any open ticket and reopen resolved ones only', () => {
    expect(requesterActions('open').map((a) => a.status)).toEqual(['closed'])
    expect(requesterActions('resolved').map((a) => a.status)).toEqual(['open', 'closed'])
    expect(requesterActions('closed')).toEqual([])
    expect(canReply('closed')).toBe(false)
    expect(canReply('waiting_for_user')).toBe(true)
  })

  it('only lets staff reopen a closed ticket', () => {
    expect(STAFF_TRANSITIONS.closed).toEqual(['open'])
    expect(STAFF_TRANSITIONS.resolved).toEqual(['open', 'closed'])
  })

  it('uses customer-facing wording per audience', () => {
    expect(ticketStatusLabel('waiting_for_user')).toBe('Waiting for you')
    expect(ticketStatusLabel('waiting_for_user', true)).toBe('Waiting for customer')
  })
})
