import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { SESSION_EXPIRED_EVENT, session } from '@/api/session'

/** Shape of every error body returned by the backend (see apps/core/exceptions.py). */
export interface ApiErrorBody {
  error: {
    code: string
    message: string
    details?: Record<string, unknown>
  }
  request_id?: string
}

/** Normalised error thrown by every API call so UI code handles one type. */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details?: Record<string, unknown>
  readonly requestId?: string

  constructor(status: number, code: string, message: string, details?: Record<string, unknown>, requestId?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
    this.requestId = requestId
  }
}

function isApiErrorBody(data: unknown): data is ApiErrorBody {
  return typeof data === 'object' && data !== null && 'error' in data
}

const baseURL = import.meta.env.VITE_API_BASE_URL ?? '/api/v1'
/** For plain URLs (e.g. <img src>) that bypass axios. */
export const API_BASE_URL = baseURL

export const api = axios.create({
  baseURL,
  timeout: 30_000,
  headers: { Accept: 'application/json' },
})

// Separate instance with no interceptors, so a failing refresh can't recurse.
const bare = axios.create({ baseURL, timeout: 30_000 })

interface RetriableConfig extends InternalAxiosRequestConfig {
  _retried?: boolean
}

api.interceptors.request.use((config) => {
  const token = session.getAccessToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  const businessId = session.getBusinessId()
  // Only a selector: the server verifies membership on every request.
  if (businessId && !config.headers.has('X-Business-ID')) config.headers.set('X-Business-ID', businessId)
  return config
})

let refreshInFlight: Promise<string> | null = null

/** Exchange the refresh token for a new pair. Concurrent callers share one request. */
export function refreshAccessToken(): Promise<string> {
  const refresh = session.getRefreshToken()
  if (!refresh) return Promise.reject(new ApiError(401, 'not_authenticated', 'Please sign in.'))
  refreshInFlight ??= bare
    .post<{ access: string; refresh: string }>('/auth/token/refresh/', { refresh })
    .then(({ data }) => {
      session.setTokens(data)
      return data.access
    })
    .finally(() => {
      refreshInFlight = null
    })
  return refreshInFlight
}

const AUTH_PATHS = ['/auth/login/', '/auth/register/', '/auth/token/refresh/', '/auth/logout/']

function toApiError(error: AxiosError): ApiError {
  if (error.response) {
    const { status, data } = error.response
    if (isApiErrorBody(data)) {
      return new ApiError(status, data.error.code, data.error.message, data.error.details, data.request_id)
    }
    return new ApiError(status, 'http_error', `Request failed with status ${status}.`)
  }
  if (error.code === 'ECONNABORTED') return new ApiError(0, 'timeout', 'The server took too long to respond.')
  return new ApiError(0, 'network_error', 'Unable to reach the server. Check your connection.')
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as RetriableConfig | undefined
    const isAuthCall = AUTH_PATHS.some((p) => config?.url?.endsWith(p))

    if (error.response?.status === 401 && config && !config._retried && !isAuthCall && session.getRefreshToken()) {
      config._retried = true
      try {
        const access = await refreshAccessToken()
        config.headers.Authorization = `Bearer ${access}`
        return api(config)
      } catch {
        session.clear()
        window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT))
      }
    }
    return Promise.reject(toApiError(error))
  },
)

/** Unwrap bare-instance errors (used by AuthProvider bootstrap). */
export function asApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error
  if (axios.isAxiosError(error)) return toApiError(error)
  return new ApiError(0, 'unknown_error', 'Something went wrong.')
}
