import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { Paginated } from '@/types/api'
import type {
  AdminPayment,
  AdminPlan,
  AdminSubscription,
  BillingInterval,
  BillingOverview,
  Invoice,
  Payment,
  Plan,
  Quote,
  Subscription,
} from '@/types/billing'

/** Every billing query key starts with 'billing' so one invalidation refreshes the whole area. */
const keys = {
  plans: (interval?: BillingInterval) => ['billing', 'plans', interval] as const,
  overview: (businessId: string | null) => ['billing', 'overview', businessId] as const,
  history: (businessId: string | null) => ['billing', 'history', businessId] as const,
  quote: (businessId: string | null, planId: string) => ['billing', 'quote', businessId, planId] as const,
  payment: (id: string) => ['billing', 'payment', id] as const,
  payments: (businessId: string | null, page: number) => ['billing', 'payments', businessId, page] as const,
  invoices: (businessId: string | null, page: number) => ['billing', 'invoices', businessId, page] as const,
  invoice: (id: string) => ['billing', 'invoice', id] as const,
}

function useInvalidateBilling() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: ['billing'] })
}

// --- Public plans ---------------------------------------------------------------------------
export function usePlans(interval?: BillingInterval) {
  return useQuery({
    queryKey: keys.plans(interval),
    queryFn: async () => (await api.get<Plan[]>('/billing/plans/', { params: { interval } })).data,
  })
}

// --- Business billing -----------------------------------------------------------------------
export function useBillingOverview(businessId: string | null, enabled = true) {
  return useQuery({
    queryKey: keys.overview(businessId),
    enabled: Boolean(businessId) && enabled,
    queryFn: async () => (await api.get<BillingOverview>('/billing/subscription/')).data,
  })
}

export function useSubscriptionHistory(businessId: string | null) {
  return useQuery({
    queryKey: keys.history(businessId),
    enabled: Boolean(businessId),
    queryFn: async () =>
      (await api.get<Paginated<Subscription>>('/billing/subscriptions/', { params: { page_size: 50 } })).data,
  })
}

export function useQuote(businessId: string | null, planId: string) {
  return useQuery({
    queryKey: keys.quote(businessId, planId),
    enabled: Boolean(businessId && planId),
    queryFn: async () => (await api.get<Quote>('/billing/checkout/quote/', { params: { plan_id: planId } })).data,
  })
}

export function useCheckout() {
  const invalidate = useInvalidateBilling()
  return useMutation({
    mutationFn: async (planId: string) => (await api.post<Payment>('/billing/checkout/', { plan_id: planId })).data,
    onSuccess: invalidate,
  })
}

export function usePayment(paymentId: string, poll: boolean) {
  return useQuery({
    queryKey: keys.payment(paymentId),
    queryFn: async () => (await api.get<Payment>(`/billing/payments/${paymentId}/`)).data,
    // Waiting for the verified webhook: poll gently while the payment is open.
    refetchInterval: (query) => (poll && query.state.data?.status === 'created' ? 3000 : false),
  })
}

export function usePayments(businessId: string | null, page: number) {
  return useQuery({
    queryKey: keys.payments(businessId, page),
    enabled: Boolean(businessId),
    placeholderData: keepPreviousData,
    queryFn: async () => (await api.get<Paginated<Payment>>('/billing/payments/', { params: { page } })).data,
  })
}

function usePaymentAction(action: 'refresh' | 'cancel' | 'confirm' | 'simulate') {
  const invalidate = useInvalidateBilling()
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body?: Record<string, unknown> }) =>
      (await api.post<Payment>(`/billing/payments/${id}/${action}/`, body ?? {})).data,
    onSuccess: invalidate,
  })
}

export const useRefreshPayment = () => usePaymentAction('refresh')
export const useCancelCheckout = () => usePaymentAction('cancel')
export const useConfirmPayment = () => usePaymentAction('confirm')
export const useSimulatePayment = () => usePaymentAction('simulate')

function useSubscriptionAction(path: string) {
  const invalidate = useInvalidateBilling()
  return useMutation({
    mutationFn: async (body?: Record<string, unknown>) =>
      (await api.post<Subscription>(`/billing/subscription/${path}/`, body ?? {})).data,
    onSuccess: invalidate,
  })
}

export const useCancelSubscription = () => useSubscriptionAction('cancel')
export const useResumeSubscription = () => useSubscriptionAction('resume')
export const useScheduleDowngrade = () => useSubscriptionAction('schedule-downgrade')
export const useClearScheduledChange = () => useSubscriptionAction('clear-scheduled-change')

export function useInvoices(businessId: string | null, page: number, filters: { search?: string; status?: string; page_size?: number } = {}) {
  return useQuery({
    queryKey: [...keys.invoices(businessId, page), filters],
    enabled: Boolean(businessId),
    placeholderData: keepPreviousData,
    queryFn: async () =>
      (await api.get<Paginated<Invoice>>('/billing/invoices/', { params: { page, ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) } })).data,
  })
}

export function useInvoice(invoiceId: string) {
  return useQuery({
    queryKey: keys.invoice(invoiceId),
    queryFn: async () => (await api.get<Invoice>(`/billing/invoices/${invoiceId}/`)).data,
  })
}

/** Download a PDF through the authenticated client and save it (works with Bearer auth). */
export async function downloadPdf(url: string, filename: string) {
  const response = await api.get<Blob>(url, { responseType: 'blob' })
  const href = URL.createObjectURL(response.data)
  const link = document.createElement('a')
  link.href = href
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(href)
}

// --- Platform admin -------------------------------------------------------------------------
export interface AdminListParams {
  page?: number
  page_size?: number
  search?: string
  status?: string
  requires_attention?: string
  is_test?: string
}

export function useAdminPlans() {
  return useQuery({
    queryKey: ['admin', 'plans'],
    queryFn: async () => (await api.get<Paginated<AdminPlan>>('/admin/plans/', { params: { page_size: 100 } })).data,
  })
}

export function useSaveAdminPlan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...body }: Partial<AdminPlan> & { id?: string }) =>
      id ? (await api.patch<AdminPlan>(`/admin/plans/${id}/`, body)).data : (await api.post<AdminPlan>('/admin/plans/', body)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'plans'] })
      qc.invalidateQueries({ queryKey: ['billing', 'plans'] })
    },
  })
}

export function useDeleteAdminPlan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/admin/plans/${id}/`)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'plans'] }),
  })
}

export function useAdminSubscriptions(params: AdminListParams) {
  return useQuery({
    queryKey: ['admin', 'subscriptions', params],
    placeholderData: keepPreviousData,
    queryFn: async () => (await api.get<Paginated<AdminSubscription>>('/admin/subscriptions/', { params })).data,
  })
}

export function useAdminCancelSubscription() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, immediately }: { id: string; immediately: boolean }) =>
      (await api.post<AdminSubscription>(`/admin/subscriptions/${id}/cancel/`, { immediately })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'subscriptions'] }),
  })
}

export function useAdminPayments(params: AdminListParams) {
  return useQuery({
    queryKey: ['admin', 'payments', params],
    placeholderData: keepPreviousData,
    queryFn: async () => (await api.get<Paginated<AdminPayment>>('/admin/payments/', { params })).data,
  })
}

export function useAdminReconcile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => (await api.post<AdminPayment>(`/admin/payments/${id}/reconcile/`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'payments'] })
      qc.invalidateQueries({ queryKey: ['admin', 'subscriptions'] })
    },
  })
}
