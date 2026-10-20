import { ApiError } from '@/api/client'
import { dayMonthYear } from '@/utils/dates'

export function formatDuration(seconds: number | null | undefined) {
  if (seconds === null || seconds === undefined) return null
  const s = Math.round(seconds)
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

/** "₹2,499" / "₹12,48,950" as in the UI reference: Indian grouping for INR, no ".00" on whole amounts. */
export function formatPrice(amount: string | null, currency: string) {
  if (amount === null) return null
  const value = Number(amount)
  try {
    return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : undefined, {
      style: 'currency',
      currency,
      minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(value)
  } catch {
    return `${currency} ${amount}`
  }
}

// Reference dates read "20 Oct 2026".
export const formatDate = (iso: string | null | undefined) => (iso ? dayMonthYear(new Date(iso)) : '—')

/** True for 402 responses (no active subscription / plan limit reached / feature not in plan). */
export function isPlanError(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === 402
}

export const ACCEPTED_MEDIA = '.jpg,.jpeg,.png,.webp,.mp4,.mov,image/jpeg,image/png,image/webp,video/mp4,video/quicktime'
export const ACCEPTED_IMAGES = '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp'
