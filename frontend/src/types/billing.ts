export type BillingInterval = 'month' | 'year'

export interface PlanLimits {
  max_catalogues: number | null
  max_products: number | null
  max_staff: number | null
  storage_limit_mb: number | null
  max_image_size_mb: number | null
  video_uploads_enabled: boolean
  max_video_size_mb: number | null
  custom_branding: boolean
  analytics_enabled: boolean
  csv_import_enabled: boolean
}

export interface Plan extends PlanLimits {
  id: string
  code: string
  name: string
  description: string
  price: string
  currency: string
  interval: BillingInterval
  tier_rank: number
  is_development_seed: boolean
}

export interface AdminPlan extends Plan {
  is_active: boolean
  is_public: boolean
  sort_order: number
  subscriber_count: number
  created_at: string
  updated_at: string
}

export interface PlanBrief {
  id: string
  code: string
  name: string
  price: string
  currency: string
  interval: BillingInterval
  is_active: boolean
}

export type SubscriptionStatus =
  | 'pending_payment'
  | 'scheduled'
  | 'active'
  | 'past_due'
  | 'cancelled'
  | 'expired'
  | 'superseded'
  | 'abandoned'

export interface Subscription {
  id: string
  status: SubscriptionStatus
  plan: PlanBrief
  plan_code: string
  plan_name: string
  plan_price: string
  plan_currency: string
  plan_interval: BillingInterval
  limits: PlanLimits
  starts_at: string | null
  current_period_start: string | null
  current_period_end: string | null
  grace_until: string | null
  cancel_at_period_end: boolean
  cancelled_at: string | null
  pending_plan: PlanBrief | null
  activated_at: string | null
  ended_at: string | null
  abandoned_reason: string
  created_at: string
}

export type PaymentStatus = 'created' | 'captured' | 'failed' | 'expired'
export type PaymentKind = 'new' | 'renewal' | 'plan_change' | 'scheduled_change'

export interface CheckoutPayload {
  provider: 'mock' | 'razorpay' | string
  order_id: string
  key_id?: string
  amount?: number
  currency?: string
  test_mode?: boolean
}

export interface Payment {
  id: string
  kind: PaymentKind
  status: PaymentStatus
  provider: string
  is_test: boolean
  provider_order_id: string
  subscription_id: string
  plan_id: string
  plan_name: string
  currency: string
  subtotal: string
  discount_amount: string
  tax_name: string
  tax_rate: string
  tax_inclusive: boolean
  tax_amount: string
  amount: string
  period_start: string | null
  period_end: string | null
  expires_at: string
  paid_at: string | null
  applied_at: string | null
  failure_code: string
  failure_message: string
  under_review: boolean
  invoice_id: string | null
  checkout: CheckoutPayload | null
  created_at: string
}

export interface PaymentEvent {
  id: number
  provider: string
  event_id: string
  event_type: string
  outcome: 'processed' | 'ignored'
  detail: string
  summary: Record<string, unknown>
  received_at: string
}

export interface BusinessRef {
  id: string
  name: string
  slug: string
}

export interface AdminPayment extends Payment {
  business: BusinessRef
  provider_payment_id: string
  requires_attention: boolean
  attention_reason: string
  last_reconciled_at: string | null
  events: PaymentEvent[]
}

export interface AdminSubscription extends Subscription {
  business: BusinessRef
}

export interface InvoiceLine {
  description: string
  plan_code: string
  quantity: number
  unit_price: string
  amount: string
}

export interface Party {
  name?: string
  contact?: string
  email?: string
  phone?: string
  address?: string
  tax_id?: string
}

export interface Invoice {
  id: string
  number: string
  status: 'paid' | 'void'
  issued_at: string
  period_start: string | null
  period_end: string | null
  currency: string
  subtotal: string
  discount_amount: string
  tax_name: string
  tax_rate: string
  tax_inclusive: boolean
  tax_amount: string
  total: string
  is_test: boolean
  seller: Party
  buyer: Party
  lines: InvoiceLine[]
  payment_id: string
  subscription_id: string
}

export interface QuoteBlocker {
  code: string
  message: string
}

export interface Quote {
  plan: Plan
  kind: PaymentKind | 'downgrade'
  currency: string
  subtotal: string
  tax_name: string
  tax_rate: string
  tax_inclusive: boolean
  tax_amount: string
  total: string
  period_start: string
  period_end: string
  can_checkout: boolean
  blockers: QuoteBlocker[]
}

export interface UsageRow {
  key: string
  label: string
  used: number | null
  limit: number | null
}

export interface BillingOverview {
  subscription: Subscription | null
  scheduled: Subscription | null
  open_checkout: Payment | null
  has_paid_access: boolean
  usage: UsageRow[]
  email_verified: boolean
  payments_test_mode: boolean
}
