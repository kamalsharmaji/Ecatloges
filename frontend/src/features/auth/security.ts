/** Pure helpers for the account security UI (2FA, sessions, security activity). */

export type DeviceKind = 'windows' | 'apple' | 'phone' | 'desktop'

/** Icon family for a server-provided "Browser on OS" label. */
export function deviceKind(label: string): DeviceKind {
  if (/\b(Android|iOS|iPadOS)\b/.test(label)) return 'phone'
  if (/\bWindows\b/.test(label)) return 'windows'
  if (/\bmacOS\b/.test(label)) return 'apple'
  return 'desktop'
}

/** "just now", "5 minutes ago", "2 hours ago", "3 days ago" — falls back to null after 30 days. */
export function timeAgo(iso: string, now: Date = new Date()): string | null {
  const seconds = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 1000))
  if (seconds < 60) return 'just now'
  const units: Array<[number, string]> = [[86_400, 'day'], [3_600, 'hour'], [60, 'minute']]
  for (const [size, name] of units) {
    const n = Math.floor(seconds / size)
    if (n >= 1) return n > 30 && name === 'day' ? null : `${n} ${name}${n === 1 ? '' : 's'} ago`
  }
  return null
}

/** Groups a base32 key in fours for manual entry: "ABCD EFGH …". */
export function groupSecret(secret: string): string {
  return secret.replace(/\s+/g, '').match(/.{1,4}/g)?.join(' ') ?? ''
}

/** Plain-text file content for "Download recovery codes". */
export function recoveryCodesText(codes: string[], account: string, generatedAt: Date = new Date()): string {
  return [
    'myEcatalogues recovery codes',
    `Account: ${account}`,
    `Generated: ${generatedAt.toISOString().slice(0, 10)}`,
    '',
    'Each code can be used once to sign in if you lose your authenticator app.',
    'Generating new codes makes all of these stop working.',
    '',
    ...codes,
    '',
  ].join('\n')
}

const FAILED_ACTIONS = new Set(['auth.login_failed', 'auth.mfa_failed'])

/** Status chip for a security event. */
export function eventOutcome(action: string): 'failed' | 'success' {
  return FAILED_ACTIONS.has(action) ? 'failed' : 'success'
}
