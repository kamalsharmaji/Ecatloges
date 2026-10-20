import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { api, asApiError } from '@/api/client'
import type { ListParams } from '@/api/content'
import type { Paginated } from '@/types/api'
import type { AnalyticsOverview, Customer, CustomerDetail, CustomerSummary, Enquiry, EnquiryStatus, EnquirySummary, TrafficSource } from '@/types/leads'

function clean(params: ListParams): ListParams {
  return Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v !== undefined))
}

// --- Enquiries ----------------------------------------------------------------------------------
export function useEnquiries(businessId: string | null, params: ListParams, enabled = true) {
  return useQuery({
    queryKey: ['enquiries', businessId, 'list', clean(params)],
    enabled: Boolean(businessId) && enabled,
    placeholderData: keepPreviousData,
    queryFn: async () => (await api.get<Paginated<Enquiry>>('/enquiries/', { params: clean(params) })).data,
  })
}

export function useEnquirySummary(businessId: string | null, enabled = true) {
  return useQuery({
    queryKey: ['enquiries', businessId, 'summary'],
    enabled: Boolean(businessId) && enabled,
    refetchInterval: 60_000, // keeps the sidebar "new" badge reasonably fresh
    queryFn: async () => (await api.get<EnquirySummary>('/enquiries/summary/')).data,
  })
}

export function useEnquiry(businessId: string | null, id: string | null) {
  return useQuery({
    queryKey: ['enquiries', businessId, 'detail', id],
    enabled: Boolean(businessId && id),
    queryFn: async () => (await api.get<Enquiry>(`/enquiries/${id}/`)).data,
  })
}

export function useUpdateEnquiry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...input }: { id: string; status?: EnquiryStatus; internal_notes?: string }) =>
      (await api.patch<Enquiry>(`/enquiries/${id}/`, input)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['enquiries'] })
      qc.invalidateQueries({ queryKey: ['customers'] })
    },
  })
}

export function useEnquiryBulk() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { ids: string[]; action: 'set_status' | 'delete'; status?: EnquiryStatus }) =>
      (await api.post<{ updated: number }>('/enquiries/bulk/', input)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['enquiries'] })
      qc.invalidateQueries({ queryKey: ['customers'] })
    },
  })
}

export function useDeleteEnquiry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/enquiries/${id}/`)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['enquiries'] }),
  })
}

// --- Customers ----------------------------------------------------------------------------------
export function useCustomers(businessId: string | null, params: ListParams) {
  return useQuery({
    queryKey: ['customers', businessId, 'list', clean(params)],
    enabled: Boolean(businessId),
    placeholderData: keepPreviousData,
    queryFn: async () => (await api.get<Paginated<Customer>>('/customers/', { params: clean(params) })).data,
  })
}

export function useCustomerSummary(businessId: string | null) {
  return useQuery({
    queryKey: ['customers', businessId, 'summary'],
    enabled: Boolean(businessId),
    queryFn: async () => (await api.get<CustomerSummary>('/customers/summary/')).data,
  })
}

export function useCustomer(businessId: string | null, id: string | null) {
  return useQuery({
    queryKey: ['customers', businessId, 'detail', id],
    enabled: Boolean(businessId && id),
    queryFn: async () => (await api.get<CustomerDetail>(`/customers/${id}/`)).data,
  })
}

export type CustomerInput = Pick<Customer, 'name' | 'phone' | 'email' | 'company' | 'city' | 'notes'>

export function useSaveCustomer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...input }: Partial<CustomerInput> & { id?: string }) =>
      id ? (await api.patch<Customer>(`/customers/${id}/`, input)).data : (await api.post<Customer>('/customers/', input)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }),
  })
}

export function useDeleteCustomer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/customers/${id}/`)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers'] })
      qc.invalidateQueries({ queryKey: ['enquiries'] })
    },
  })
}

// --- Analytics ----------------------------------------------------------------------------------
export const browserTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'

export function useAnalytics(businessId: string | null, range: { from: string; to: string }, enabled = true) {
  return useQuery({
    queryKey: ['analytics', businessId, range],
    enabled: Boolean(businessId) && enabled,
    placeholderData: keepPreviousData,
    retry: false,
    queryFn: async () =>
      (await api.get<AnalyticsOverview>('/analytics/overview/', { params: { ...range, tz: browserTimezone() } })).data,
  })
}

// --- QR codes -----------------------------------------------------------------------------------
/** Fetch a QR image through the authenticated client and return an object URL (caller revokes it). */
export async function fetchQr(catalogueId: string, opts: { type?: 'png' | 'svg'; color?: 'brand' | 'black'; size?: number } = {}) {
  const response = await api.get<Blob>(`/catalogues/${catalogueId}/qr/`, {
    params: { type: opts.type ?? 'png', color: opts.color ?? 'brand', size: opts.size ?? 600 },
    responseType: 'blob',
  })
  return { url: URL.createObjectURL(response.data), target: String(response.headers['x-qr-target'] ?? '') }
}

// --- Public (anonymous) ------------------------------------------------------------------------
const publicApi = axios.create({ baseURL: import.meta.env.VITE_API_BASE_URL ?? '/api/v1', timeout: 30_000 })

export interface PublicEnquiryInput {
  name: string
  phone: string
  email: string
  message: string
  quantity: number | null
  product_id: string | null
  source: string
  idempotency_key: string
  website: string
  elapsed_ms: number
}

export async function submitPublicEnquiry(businessSlug: string, catalogueSlug: string, input: PublicEnquiryInput) {
  try {
    return (await publicApi.post<{ status: string; reference: string }>(`/public/catalogues/${businessSlug}/${catalogueSlug}/enquiries/`, input)).data
  } catch (error) {
    throw asApiError(error)
  }
}

const VISITOR_KEY = 'mec.visitor'

/** Random per-browser id (no personal data). Falls back to a per-page id if storage is blocked. */
export function visitorId(): string {
  try {
    let id = localStorage.getItem(VISITOR_KEY)
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem(VISITOR_KEY, id)
    }
    return id
  } catch {
    return crypto.randomUUID()
  }
}

/** Fire-and-forget view beacon; analytics must never break the page. */
export function trackView(businessSlug: string, catalogueSlug: string, source: TrafficSource, productId?: string) {
  publicApi
    .post(`/public/catalogues/${businessSlug}/${catalogueSlug}/events/`, { visitor_id: visitorId(), source, product_id: productId ?? null })
    .catch(() => undefined)
}

/** Where did this visit come from? ?src=qr wins; otherwise classify the referrer. */
export function detectSource(search: string, referrer: string): TrafficSource {
  const src = new URLSearchParams(search).get('src')
  if (src === 'qr') return 'qr_code'
  if (src === 'whatsapp') return 'whatsapp'
  if (!referrer) return 'direct'
  let host = ''
  try {
    host = new URL(referrer).hostname
  } catch {
    return 'other'
  }
  if (host === window.location.hostname) return 'direct'
  // Match whole domain labels so e.g. "box.com" isn't taken for x.com.
  const is = (...domains: string[]) => domains.some((d) => host === d || host.endsWith(`.${d}`))
  const brand = (...names: string[]) => names.some((n) => host.split('.').includes(n))
  if (is('wa.me') || brand('whatsapp')) return 'whatsapp'
  if (brand('google', 'bing', 'duckduckgo', 'yahoo')) return 'search'
  if (is('t.co', 'x.com') || brand('facebook', 'instagram', 'twitter', 'linkedin', 'pinterest', 'youtube')) return 'social'
  return 'other'
}

/** Download a catalogue's QR image as a file. */
export async function downloadQr(catalogueId: string, slug: string, type: 'png' | 'svg') {
  const { url } = await fetchQr(catalogueId, { type, size: 1200 })
  const link = document.createElement('a')
  link.href = url
  link.download = `${slug}-qr.${type}`
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
