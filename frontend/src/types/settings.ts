// Phase 8: settings, notification preferences, announcements and email templates.
import type { MediaBrief } from '@/types/content'
import type { NotificationLevel } from '@/types/workspace'

export interface BusinessSettings {
  logo: MediaBrief | null
  brand_color: string
  default_show_prices: boolean
  default_enquiries_enabled: boolean
  default_whatsapp_number: string
  enquiry_email_enabled: boolean
}

export type BusinessSettingsInput = Partial<Omit<BusinessSettings, 'logo'>> & { logo_id?: string | null }

export interface NotificationPreference {
  key: string
  label: string
  description: string
  note: string
  in_app: boolean | null
  email: boolean | null
  in_app_available: boolean
  email_available: boolean
  in_app_locked: boolean
  email_locked: boolean
}

export type PreferenceChange = { key: string; in_app?: boolean; email?: boolean }

export type AnnouncementAudience = 'all_businesses' | 'business_owners' | 'selected_businesses' | 'platform_staff'
export type AnnouncementStatus = 'draft' | 'scheduled' | 'published' | 'unpublished' | 'archived'

export interface AnnouncementFeedItem {
  id: string
  title: string
  body: string
  level: NotificationLevel
  published_at: string | null
  ends_at: string | null
}

export interface BusinessOption {
  id: string
  name: string
  slug: string
}

export interface Announcement {
  id: string
  title: string
  body: string
  level: NotificationLevel
  audience: AnnouncementAudience
  businesses: BusinessOption[]
  status: AnnouncementStatus
  send_email: boolean
  starts_at: string | null
  ends_at: string | null
  published_at: string | null
  delivered_at: string | null
  recipient_count: number
  created_by_name: string
  created_at: string
  updated_at: string
}

export interface AnnouncementInput {
  title: string
  body: string
  level: NotificationLevel
  audience: AnnouncementAudience
  business_ids: string[]
  send_email: boolean
  starts_at: string | null
  ends_at: string | null
}

export interface TemplateVariable {
  name: string
  description: string
  required: boolean
  sample: string
}

export interface EmailTemplate {
  key: string
  name: string
  description: string
  group: string
  mandatory: boolean
  variables: TemplateVariable[]
  subject: string
  body: string
  default_subject: string
  default_body: string
  is_custom: boolean
  is_active: boolean
  updated_at: string | null
  updated_by_name: string
}

export interface EmailPreview {
  subject: string
  body: string
  errors: Record<string, string[]>
}
