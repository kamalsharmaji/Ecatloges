import type { NotificationCategory, NotificationLevel, TicketCategory, TicketPriority, TicketStatus } from '@/types/workspace'

// --- Time ---------------------------------------------------------------------------------------------
const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
const STEPS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['second', 60], ['minute', 60], ['hour', 24], ['day', 7], ['week', 4.35], ['month', 12], ['year', Infinity],
]

/** "10 minutes ago", "yesterday", "3 weeks ago". */
export function relativeTime(iso: string, now: Date = new Date()): string {
  let value = (new Date(iso).getTime() - now.getTime()) / 1000
  if (Math.abs(value) < 45) return 'just now'
  for (const [unit, size] of STEPS) {
    if (Math.abs(value) < size) return rtf.format(Math.round(value), unit)
    value /= size
  }
  return rtf.format(Math.round(value), 'year')
}

// --- Notifications ------------------------------------------------------------------------------------
export const NOTIFICATION_CATEGORIES: { key: NotificationCategory; label: string }[] = [
  { key: 'enquiry', label: 'Enquiries' },
  { key: 'catalogue', label: 'Catalogues' },
  { key: 'payment', label: 'Payments' },
  { key: 'subscription', label: 'Subscription' },
  { key: 'team', label: 'Team Activity' },
  { key: 'support', label: 'Support' },
  { key: 'product', label: 'Products' },
  { key: 'system', label: 'System' },
]

export const LEVEL_STYLE: Record<NotificationLevel, { label: string; className: string }> = {
  info: { label: 'Info', className: 'bg-[#e0ebff] text-[#1f5fe0]' },
  success: { label: 'Success', className: 'bg-[#dcf7e5] text-[#14a04a]' },
  warning: { label: 'Warning', className: 'bg-[#fff1d6] text-[#d97706]' },
  error: { label: 'Action needed', className: 'bg-[#ffe1e8] text-[#e11d48]' },
}

// --- Activity log ---------------------------------------------------------------------------------
const ACTION_LABELS: Record<string, string> = {
  'enquiry.received': 'Enquiry received',
  'enquiry.status_changed': 'Enquiry status changed',
  'enquiry.updated': 'Enquiry notes updated',
  'member.invited': 'Team member invited',
  'member.joined': 'Team member joined',
  'member.role_changed': 'Member role changed',
  'member.invitation_revoked': 'Invitation revoked',
  'business.ownership_transferred': 'Ownership transferred',
  'subscription.cancel_requested': 'Cancellation requested',
  'subscription.past_due': 'Subscription payment due',
  'support.ticket_created': 'Support ticket created',
  'support.status_changed': 'Ticket status changed',
  'support.replied': 'Ticket reply',
  'support.internal_note': 'Internal note added',
  'auth.login': 'Signed in',
  'auth.password_changed': 'Password changed',
  'auth.password_reset': 'Password reset',
}

const humanize = (s: string) => s.replace(/_/g, ' ')

/** "catalogue.published" → "Catalogue published"; "product.bulk_publish" → "Product bulk publish". */
export function actionLabel(action: string): string {
  if (ACTION_LABELS[action]) return ACTION_LABELS[action]
  const [module = '', verb = ''] = action.split('.', 2)
  const text = `${humanize(module)} ${humanize(verb)}`.trim()
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export const REDACTED = '[redacted]'

function show(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (Array.isArray(value)) return value.length ? value.join(', ') : '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return String(value)
}

/** One readable line per changed field. Redacted values only say that the field changed. */
export function describeChange(field: string, change: { from: unknown; to: unknown }): string {
  const name = humanize(field).replace(/^./, (c) => c.toUpperCase())
  if (change.from === REDACTED || change.to === REDACTED) return `${name} changed`
  if (change.from === null && field.startsWith('permissions_')) return `${name}: ${show(change.to)}`
  if (change.from === null && (field === 'media' || field === 'catalogues')) return `${name} updated: ${show(change.to)}`
  return `${name}: ${show(change.from)} → ${show(change.to)}`
}

// --- Support tickets ------------------------------------------------------------------------------
export const TICKET_STATUS: Record<TicketStatus, { label: string; className: string }> = {
  open: { label: 'Open', className: 'bg-[#ffe1e8] text-[#e11d48] ring-transparent' },
  in_progress: { label: 'In Progress', className: 'bg-[#fff1d6] text-[#d97706] ring-transparent' },
  waiting_for_user: { label: 'Waiting for you', className: 'bg-[#e0ebff] text-[#1f5fe0] ring-transparent' },
  resolved: { label: 'Resolved', className: 'bg-[#dcf7e5] text-[#14a04a] ring-transparent' },
  closed: { label: 'Closed', className: 'bg-[#eceff5] text-[#55607f] ring-transparent' },
}
export const TICKET_STATUS_ORDER: TicketStatus[] = ['open', 'in_progress', 'waiting_for_user', 'resolved', 'closed']

/** Admin wording differs only for the waiting state. */
export const ticketStatusLabel = (status: TicketStatus, admin = false) =>
  admin && status === 'waiting_for_user' ? 'Waiting for customer' : TICKET_STATUS[status].label

export const TICKET_PRIORITY: Record<TicketPriority, { label: string; className: string }> = {
  low: { label: 'Low', className: 'bg-[#dcf7e5] text-[#14a04a]' },
  medium: { label: 'Medium', className: 'bg-[#fff1d6] text-[#d97706]' },
  high: { label: 'High', className: 'bg-[#ffe1e8] text-[#e11d48]' },
  urgent: { label: 'Urgent', className: 'bg-red-600 text-white' },
}

export const TICKET_CATEGORY: Record<TicketCategory, string> = {
  technical: 'Technical',
  billing: 'Billing & payments',
  subscription: 'Subscription',
  catalogue: 'Catalogues & products',
  qr_code: 'QR codes',
  domain: 'Domain',
  account: 'Account',
  feature_request: 'Feature request',
  other: 'Other',
}

/** Mirrors the server policy (apps/support/services.py) so only allowed buttons are shown. */
export const STAFF_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  open: ['in_progress', 'waiting_for_user', 'resolved', 'closed'],
  in_progress: ['open', 'waiting_for_user', 'resolved', 'closed'],
  waiting_for_user: ['open', 'in_progress', 'resolved', 'closed'],
  resolved: ['open', 'closed'],
  closed: ['open'],
}

export function requesterActions(status: TicketStatus): { status: TicketStatus; label: string }[] {
  const actions: { status: TicketStatus; label: string }[] = []
  if (status === 'resolved') actions.push({ status: 'open', label: 'Reopen ticket' })
  if (status !== 'closed') actions.push({ status: 'closed', label: 'Close ticket' })
  return actions
}

export const canReply = (status: TicketStatus) => status !== 'closed'
