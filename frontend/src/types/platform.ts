// Phase 9: Super Admin platform management.
import type { MediaBrief } from '@/types/content'

export interface DashboardData {
  range: { from: string; to: string; timezone: string }
  businesses: { total: number; active: number; suspended: number; new: number }
  users: { total: number; active: number; new: number }
  subscriptions: { active: number; past_due: number; expiring_soon: number; cancelling: number; lapsed: number; never_subscribed: number }
  revenue: { currency: string; gross: string; tax: string; payments: number }[]
  refunds_tracked: boolean
  test_payments: number
  revenue_series: { currencies: string[]; months: { month: string; totals: Record<string, string> }[] }
  business_growth: { month: string; count: number }[]
  content: { catalogues: number; published_catalogues: number; products: number; storage_bytes: number }
  enquiries: { total: number; converted: number }
  support: { open: number; unassigned: number }
  top_plans: { plan_name: string; subscribers: number }[]
  top_categories: { category: string; count: number }[]
  expiring: { business_id: string; business_name: string; plan_name: string; ends_at: string; cancelling: boolean }[]
  recent_businesses: { id: string; name: string; status: string; plan_name: string; members: number; created_at: string }[]
  recent_payments: { id: string; business_name: string; plan_name: string; amount: string; currency: string; is_test: boolean; paid_at: string }[]
  recent_events: { id: number; action: string; target_label: string; business_name: string; actor_name: string; created_at: string }[]
}

export interface SystemStatus {
  ok: boolean
  checks: { key: string; label: string; ok: boolean; detail: string }[]
  config: Record<string, unknown>
  checked_at: string
}

export interface AdminBusiness {
  id: string
  name: string
  slug: string
  category: string
  city: string
  state: string
  country: string
  phone: string
  email: string
  status: 'active' | 'suspended'
  owner_name: string
  owner_email: string
  member_count: number
  catalogue_count: number
  product_count: number
  enquiry_count: number
  storage_bytes: number
  plan_name: string | null
  subscription_status: string | null
  subscription_ends_at: string | null
  created_at: string
}

export interface AdminBusinessDetail extends AdminBusiness {
  address_line1: string
  address_line2: string
  postal_code: string
  website: string
  description: string
  logo: MediaBrief | null
  members: { id: string; user_id: string; name: string; email: string; role: string; status: string; is_owner: boolean }[]
  subscriptions: { id: string; plan_name: string; status: string; current_period_start: string | null; current_period_end: string | null; cancel_at_period_end: boolean; created_at: string }[]
  payments: { id: string; amount: string; currency: string; status: string; is_test: boolean; paid_at: string | null; created_at: string }[]
  catalogues: { id: string; name: string; status: string; public_url: string | null }[]
  activity: AdminEvent[]
}

export interface AdminEvent {
  id: number
  action: string
  actor_name: string
  target_label: string
  created_at: string
}

export interface BusinessSummary {
  total: number
  active: number
  suspended: number
  new_this_month: number
  with_plan: number
  expiring: number
  without_plan: number
  plans: string[]
}

export type PlatformRole = '' | 'super_admin' | 'support_admin'

export interface AdminUser {
  id: string
  email: string
  full_name: string
  phone: string
  platform_role: PlatformRole
  is_active: boolean
  is_email_verified: boolean
  date_joined: string
  last_login: string | null
  membership_count: number
}

export interface AdminUserDetail extends AdminUser {
  memberships: { business_id: string; business_name: string; business_status: string; role: string; status: string; joined_at: string }[]
  platform_permissions: string[]
  activity: AdminEvent[]
}

export interface UserSummary {
  total: number
  active: number
  inactive: number
  unverified: number
  super_admins: number
  support_admins: number
  new_this_month: number
}

export interface AdminCatalogue {
  id: string
  name: string
  slug: string
  status: 'draft' | 'published' | 'archived'
  business_id: string
  business_name: string
  business_status: string
  cover: MediaBrief | null
  product_count: number
  view_count: number
  enquiry_count: number
  public_url: string | null
  published_at: string | null
  created_at: string
  updated_at: string
}

export interface CatalogueSummary {
  total: number
  published: number
  draft: number
  archived: number
  new_this_month: number
  live: number
  products: number
}
