import { describe, expect, it } from 'vitest'
import { isMfaChallenge } from '@/api/auth'
import { deviceKind, eventOutcome, groupSecret, recoveryCodesText, timeAgo } from '@/features/auth/security'
import type { AuthResponse, MfaChallengeResponse } from '@/types/api'

describe('login response', () => {
  it('recognises an MFA challenge (no tokens) vs a token pair', () => {
    const challenge: MfaChallengeResponse = { mfa_required: true, challenge: 'c', expires_in: 300, methods: ['totp'] }
    const pair = { access: 'a', refresh: 'r', user: {} } as AuthResponse
    expect(isMfaChallenge(challenge)).toBe(true)
    expect(isMfaChallenge(pair)).toBe(false)
  })
})

describe('session helpers', () => {
  it('maps device labels to icon families', () => {
    expect(deviceKind('Chrome on Windows')).toBe('windows')
    expect(deviceKind('Safari on iOS')).toBe('phone')
    expect(deviceKind('Chrome on Android')).toBe('phone')
    expect(deviceKind('Safari on macOS')).toBe('apple')
    expect(deviceKind('Firefox on Linux')).toBe('desktop')
    expect(deviceKind('')).toBe('desktop')
  })

  it('formats relative times', () => {
    const now = new Date('2026-10-21T12:00:00Z')
    expect(timeAgo('2026-10-21T11:59:30Z', now)).toBe('just now')
    expect(timeAgo('2026-10-21T11:59:00Z', now)).toBe('1 minute ago')
    expect(timeAgo('2026-10-21T10:00:00Z', now)).toBe('2 hours ago')
    expect(timeAgo('2026-10-18T12:00:00Z', now)).toBe('3 days ago')
    expect(timeAgo('2026-08-01T12:00:00Z', now)).toBeNull()
  })
})

describe('2FA helpers', () => {
  it('groups the manual-entry key', () => {
    expect(groupSecret('ABCDEFGHIJKLMN')).toBe('ABCD EFGH IJKL MN')
  })

  it('builds the recovery code file with every code once', () => {
    const text = recoveryCodesText(['aaaaa-bbbbb', 'ccccc-ddddd'], 'me@example.com', new Date('2026-10-21T00:00:00Z'))
    expect(text).toContain('Account: me@example.com')
    expect(text).toContain('Generated: 2026-10-21')
    expect(text.match(/aaaaa-bbbbb/g)).toHaveLength(1)
    expect(text).toContain('ccccc-ddddd')
  })

  it('marks failed sign-in events', () => {
    expect(eventOutcome('auth.login_failed')).toBe('failed')
    expect(eventOutcome('auth.mfa_failed')).toBe('failed')
    expect(eventOutcome('auth.login')).toBe('success')
  })
})
