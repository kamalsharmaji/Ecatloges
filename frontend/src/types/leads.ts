import type { MediaBrief } from '@/types/content'

export type EnquiryStatus = 'new' | 'contacted' | 'in_progress' | 'converted' | 'closed'
export type EnquirySource = 'catalogue' | 'qr_code' | 'whatsapp' | 'social' | 'search' | 'manual'
export type TrafficSource = 'direct' | 'qr_code' | 'whatsapp' | 'social' | 'search' | 'other'

export interface Enquiry {
  id: string
  name: string
  phone: string
  email: string
  message: string
  quantity: number | null
  product_name: string
  catalogue_name: string
  catalogue: { id: string; name: string } | null
  product: { id: string; name: string; sku: string; price: string | null; currency: string; thumbnail: MediaBrief | null } | null
  customer: { id: string; name: string; phone: string; email: string } | null
  source: EnquirySource
  status: EnquiryStatus
  status_changed_at: string | null
  converted_at: string | null
  internal_notes: string
  created_at: string
  updated_at: string
}

export interface EnquirySummary {
  total: number
  new: number
  contacted: number
  in_progress: number
  converted: number
  closed: number
  this_month: number
}

export interface Customer {
  id: string
  name: string
  phone: string
  email: string
  company: string
  city: string
  notes: string
  last_enquiry_at: string | null
  enquiry_count: number
  open_enquiry_count: number
  converted_count: number
  created_at: string
  updated_at: string
}

export interface CustomerDetail extends Customer {
  enquiries: { id: string; product_name: string; catalogue_name: string; message: string; status: EnquiryStatus; source: EnquirySource; created_at: string }[]
}

export interface CustomerSummary {
  total: number
  new_this_month: number
  with_open_enquiries: number
  converted: number
}

export interface AnalyticsTotals {
  catalogue_views: number
  product_views: number
  unique_visitors: number
  products_viewed: number
  enquiries: number
  conversions: number
}

export interface Breakdown {
  key: string
  label: string
  count: number
}

export interface AnalyticsOverview {
  range: { from: string; to: string; tz: string; days: number }
  totals: AnalyticsTotals
  previous: AnalyticsTotals
  series: { date: string; catalogue_views: number; product_views: number; enquiries: number }[]
  sources: Breakdown[]
  devices: Breakdown[]
  enquiries_by_status: Breakdown[]
  top_catalogues: { id: string; name: string; views: number; enquiries: number; cover: MediaBrief | null }[]
  top_products: { id: string; name: string; views: number; enquiries: number; thumbnail: MediaBrief | null }[]
}
