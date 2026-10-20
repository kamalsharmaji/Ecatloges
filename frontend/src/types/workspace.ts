// Phase 7: notifications, activity log and support tickets.

export type NotificationCategory = 'enquiry' | 'catalogue' | 'product' | 'payment' | 'subscription' | 'team' | 'support' | 'system'
export type NotificationLevel = 'info' | 'success' | 'warning' | 'error'

export interface AppNotification {
  id: string
  category: NotificationCategory
  event: string
  level: NotificationLevel
  title: string
  body: string
  link: string
  target_type: string
  target_id: string
  business_id: string | null
  business_name: string
  is_read: boolean
  read_at: string | null
  created_at: string
}

export interface NotificationSummary {
  total: number
  unread: number
  categories: { category: NotificationCategory; label: string; total: number; unread: number; today: number }[]
}

export type ActorType = 'user' | 'platform_admin' | 'system' | 'public'

export interface AuditEntry {
  id: number
  created_at: string
  actor_id: string | null
  actor_name: string
  actor_type: ActorType
  action: string
  module: string
  target_type: string
  target_id: string
  target_label: string
  changes: Record<string, { from: unknown; to: unknown }>
  metadata: Record<string, unknown>
  // Platform view only
  scope?: 'business' | 'platform' | 'account'
  business_id?: string | null
  business_name?: string
  request_id?: string
}

export interface ActivityFilterOptions {
  modules: string[]
  actions: string[]
  actors: { id: string; name: string }[]
}

export type TicketStatus = 'open' | 'in_progress' | 'waiting_for_user' | 'resolved' | 'closed'
export type TicketCategory =
  | 'technical' | 'billing' | 'subscription' | 'catalogue' | 'qr_code' | 'domain' | 'account' | 'feature_request' | 'other'
export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent'

export interface TicketMessage {
  id: string
  kind: 'message' | 'event'
  author_name: string
  is_staff: boolean
  is_internal: boolean
  is_mine: boolean
  body: string
  created_at: string
}

export interface Ticket {
  id: string
  reference: string
  subject: string
  category: TicketCategory
  priority: TicketPriority
  status: TicketStatus
  created_by_name: string
  is_mine: boolean
  message_count: number
  created_at: string
  last_activity_at: string
  status_changed_at: string | null
  resolved_at: string | null
  closed_at: string | null
}

export interface TicketDetail extends Ticket {
  messages: TicketMessage[]
}

export interface StaffBrief {
  id: string
  name: string
  email: string
}

export interface AdminTicket extends Ticket {
  business_id: string | null
  business_name: string
  business_slug: string
  created_by_email: string
  assigned_to: StaffBrief | null
  first_response_at: string | null
}

export interface AdminTicketDetail extends AdminTicket {
  messages: TicketMessage[]
}

export interface TicketSummary {
  total: number
  statuses: { key: TicketStatus; label: string; count: number }[]
  categories: { key: TicketCategory; label: string; count: number }[]
  unassigned: number
}

export interface TicketInput {
  subject: string
  category: TicketCategory
  priority: TicketPriority
  description: string
  client_key: string
}
