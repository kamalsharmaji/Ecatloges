/**
 * Client-side session storage.
 *
 * - The short-lived access token is kept in memory only.
 * - The refresh token is kept in localStorage so a reload can resume the session. The backend
 *   rotates it on every refresh and blacklists it on logout/password change.
 * - The active business ID is a UI preference only; the backend re-checks membership on every request.
 *
 * Trade-off: localStorage is readable by injected scripts, so XSS prevention (no
 * dangerouslySetInnerHTML, strict CSP in production) is essential. See docs/ARCHITECTURE.md.
 */
const REFRESH_KEY = 'mec.refresh'
const BUSINESS_KEY = 'mec.business'

let accessToken: string | null = null

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function safeSet(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    /* storage unavailable (private mode) — session lasts until reload */
  }
}

export const session = {
  getAccessToken: () => accessToken,
  getRefreshToken: () => safeGet(REFRESH_KEY),
  setTokens(tokens: { access: string; refresh?: string }) {
    accessToken = tokens.access
    if (tokens.refresh) safeSet(REFRESH_KEY, tokens.refresh)
  },
  clear() {
    accessToken = null
    safeSet(REFRESH_KEY, null)
    safeSet(BUSINESS_KEY, null)
  },
  getBusinessId: () => safeGet(BUSINESS_KEY),
  setBusinessId: (id: string | null) => safeSet(BUSINESS_KEY, id),
}

/** Fired when the session can no longer be refreshed; AuthProvider listens and signs the user out. */
export const SESSION_EXPIRED_EVENT = 'mec:session-expired'
