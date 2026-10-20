import { dayMonthYear, dayMonthYearTime } from '@/utils/dates'
import type { BillingInterval, PaymentKind, PaymentStatus, PlanLimits, SubscriptionStatus } from '@/types/billing'

/** Money with Indian digit grouping for INR ("₹12,48,950.00"), as in the UI reference. */
export function formatMoney(amount: string | number, currency: string) {
  const value = typeof amount === 'string' ? Number(amount) : amount
  try {
    return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : undefined, { style: 'currency', currency }).format(value)
  } catch {
    return `${currency} ${value.toFixed(2)}`
  }
}

// Reference dates read "15 Oct 2026" / "18 Oct 2026, 10:24 AM".
export const formatDate = (iso: string | null | undefined) => (iso ? dayMonthYear(new Date(iso)) : '—')
export const formatDateTime = (iso: string | null | undefined) => (iso ? dayMonthYearTime(new Date(iso)) : '—')

export const intervalLabel = (interval: BillingInterval) => (interval === 'year' ? 'year' : 'month')

export const SUBSCRIPTION_STATUS: Record<SubscriptionStatus, { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' | 'brand' }> = {
  pending_payment: { label: 'Awaiting payment', tone: 'warning' },
  scheduled: { label: 'Scheduled', tone: 'brand' },
  active: { label: 'Active', tone: 'success' },
  past_due: { label: 'Past due', tone: 'warning' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
  expired: { label: 'Expired', tone: 'danger' },
  superseded: { label: 'Replaced', tone: 'neutral' },
  abandoned: { label: 'Not completed', tone: 'neutral' },
}

export const PAYMENT_STATUS: Record<PaymentStatus, { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' }> = {
  created: { label: 'Awaiting payment', tone: 'warning' },
  captured: { label: 'Paid', tone: 'success' },
  failed: { label: 'Failed', tone: 'danger' },
  expired: { label: 'Expired', tone: 'neutral' },
}

export const PAYMENT_KIND: Record<PaymentKind | 'downgrade', string> = {
  new: 'New subscription',
  renewal: 'Renewal',
  plan_change: 'Upgrade',
  scheduled_change: 'Plan change at period end',
  downgrade: 'Downgrade',
}

/** Human-readable limit lines for plan cards and summaries. */
export function limitLines(limits: PlanLimits): string[] {
  const n = (value: number | null, unit: string) => (value === null ? `Unlimited ${unit}` : `${value.toLocaleString()} ${unit}`)
  const storage =
    limits.storage_limit_mb === null
      ? 'Unlimited storage'
      : limits.storage_limit_mb >= 1024
        ? `${(limits.storage_limit_mb / 1024).toLocaleString(undefined, { maximumFractionDigits: 1 })} GB storage`
        : `${limits.storage_limit_mb} MB storage`
  const lines = [n(limits.max_catalogues, 'catalogues'), n(limits.max_products, 'products'), n(limits.max_staff, 'team seats'), storage]
  if (limits.max_image_size_mb !== null) lines.push(`Images up to ${limits.max_image_size_mb} MB`)
  lines.push(
    limits.video_uploads_enabled
      ? `Video uploads${limits.max_video_size_mb !== null ? ` up to ${limits.max_video_size_mb} MB` : ''}`
      : 'No video uploads',
  )
  if (limits.analytics_enabled) lines.push('Catalogue analytics')
  if (limits.csv_import_enabled) lines.push('Bulk CSV import')
  if (limits.custom_branding) lines.push('Custom branding')
  return lines
}
