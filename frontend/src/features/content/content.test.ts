import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api/client'
import { formatBytes, formatDuration, formatPrice, isPlanError } from '@/features/content/format'
import { moveItem } from '@/features/content/reorder'
import { assignableRoles } from '@/features/team/roleOptions'
import type { BusinessContext, Role } from '@/types/api'
import { applyApiErrors } from '@/utils/formErrors'

describe('formatting', () => {
  it('formats durations as mm:ss and tolerates missing values', () => {
    expect(formatDuration(28)).toBe('00:28')
    expect(formatDuration(125.6)).toBe('02:06')
    expect(formatDuration(null)).toBeNull()
  })

  it('formats byte sizes', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2048)).toBe('2.0 KB')
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB')
    expect(formatBytes(3 * 1024 ** 3)).toBe('3.00 GB')
  })

  it('treats a missing price as "no price", not zero', () => {
    expect(formatPrice(null, 'INR')).toBeNull()
    expect(formatPrice('0.00', 'INR')).not.toBeNull()
    expect(formatPrice('28999.00', 'INR')).toContain('28,999')
  })
})

describe('isPlanError', () => {
  it('only matches HTTP 402 API errors', () => {
    expect(isPlanError(new ApiError(402, 'plan_limit_exceeded', 'Limit'))).toBe(true)
    expect(isPlanError(new ApiError(403, 'permission_denied', 'No'))).toBe(false)
    expect(isPlanError(new Error('x'))).toBe(false)
  })
})

describe('moveItem', () => {
  it('moves items and ignores invalid moves', () => {
    const items = ['a', 'b', 'c', 'd']
    expect(moveItem(items, 3, 0)).toEqual(['d', 'a', 'b', 'c'])
    expect(moveItem(items, 0, 2)).toEqual(['b', 'c', 'a', 'd'])
    expect(moveItem(items, 1, 1)).toBe(items)
    expect(moveItem(items, 0, 9)).toBe(items)
    expect(items).toEqual(['a', 'b', 'c', 'd']) // never mutates
  })
})

describe('applyApiErrors', () => {
  it('maps server field errors onto form fields and returns unknown ones as a form-level message', () => {
    const setError = vi.fn()
    const error = new ApiError(400, 'validation_error', 'Invalid', { name: ['Taken.'], media_ids: ['Too many.'] })
    const message = applyApiErrors(error, setError, ['name'])
    expect(setError).toHaveBeenCalledWith('name', { type: 'server', message: 'Taken.' })
    expect(message).toBe('Too many.')
  })

  it('returns the message for non-validation errors', () => {
    expect(applyApiErrors(new ApiError(409, 'category_in_use', 'In use'), vi.fn(), [])).toBe('In use')
  })
})

describe('assignableRoles', () => {
  const role = (key: string, permissions: string[]): Role => ({
    id: key, key, name: key, is_system: true, description: '', permissions, member_count: 0, created_at: '',
  })
  const roles = [role('owner', ['a', 'b', 'x']), role('admin', ['a', 'b']), role('viewer', ['a'])]
  const ctx = (permissions: string[], is_owner = false) => ({ permissions, is_owner }) as unknown as BusinessContext

  it('mirrors the server rule: only grant what you hold; only owners grant owner', () => {
    expect(assignableRoles(roles, ctx(['a'])).map((r) => r.key)).toEqual(['viewer'])
    expect(assignableRoles(roles, ctx(['a', 'b'])).map((r) => r.key)).toEqual(['admin', 'viewer'])
    expect(assignableRoles(roles, ctx(['a', 'b', 'x'], true)).map((r) => r.key)).toEqual(['owner', 'admin', 'viewer'])
  })
})
