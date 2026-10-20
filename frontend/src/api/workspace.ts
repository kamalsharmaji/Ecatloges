import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { ListParams } from '@/api/content'
import type { Paginated } from '@/types/api'
import type {
  ActivityFilterOptions,
  AdminTicket,
  AdminTicketDetail,
  AppNotification,
  AuditEntry,
  NotificationCategory,
  NotificationSummary,
  StaffBrief,
  TicketDetail,
  Ticket,
  TicketInput,
  TicketPriority,
  TicketCategory,
  TicketStatus,
  TicketSummary,
} from '@/types/workspace'

function clean(params: ListParams): ListParams {
  return Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v !== undefined))
}

// --- Notifications --------------------------------------------------------------------------------
/**
 * `context` is a business id (business panel) or 'platform' (Super Admin panel). Notifications
 * belong to the signed-in user, so they're keyed by context, not by X-Business-ID.
 */
export function useNotifications(context: string | null, params: ListParams, enabled = true) {
  return useQuery({
    queryKey: ['notifications', context, 'list', clean(params)],
    enabled: Boolean(context) && enabled,
    placeholderData: keepPreviousData,
    queryFn: async () =>
      (await api.get<Paginated<AppNotification>>('/notifications/', { params: clean({ ...params, context: context ?? undefined }) })).data,
  })
}

export function useNotificationSummary(context: string | null) {
  return useQuery({
    queryKey: ['notifications', context, 'summary'],
    enabled: Boolean(context),
    refetchInterval: 60_000, // keeps the bell badge reasonably fresh without websockets
    queryFn: async () => (await api.get<NotificationSummary>('/notifications/summary/', { params: { context } })).data,
  })
}

export function useNotification(id: string | null) {
  return useQuery({
    queryKey: ['notifications', 'detail', id],
    enabled: Boolean(id),
    queryFn: async () => (await api.get<AppNotification>(`/notifications/${id}/`)).data,
  })
}

export function useNotificationAction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, action }: { id: string; action: 'read' | 'unread' | 'delete' }) => {
      if (action === 'delete') await api.delete(`/notifications/${id}/`)
      else await api.post(`/notifications/${id}/${action}/`)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })
}

export function useMarkAllRead(context: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (category?: NotificationCategory) =>
      (await api.post<{ updated: number }>('/notifications/read-all/', category ? { category } : {}, { params: { context } })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })
}

// --- Activity log -----------------------------------------------------------------------------------
export function useActivity(businessId: string | null, params: ListParams, enabled = true) {
  return useQuery({
    queryKey: ['activity', businessId, 'list', clean(params)],
    enabled: Boolean(businessId) && enabled,
    placeholderData: keepPreviousData,
    queryFn: async () => (await api.get<Paginated<AuditEntry>>('/activity/', { params: clean(params) })).data,
  })
}

export function useActivityFilters(businessId: string | null) {
  return useQuery({
    queryKey: ['activity', businessId, 'filters'],
    enabled: Boolean(businessId),
    queryFn: async () => (await api.get<ActivityFilterOptions>('/activity/filters/')).data,
  })
}

export function usePlatformAudit(params: ListParams) {
  return useQuery({
    queryKey: ['admin-audit', clean(params)],
    placeholderData: keepPreviousData,
    queryFn: async () => (await api.get<Paginated<AuditEntry>>('/admin/audit-logs/', { params: clean(params) })).data,
  })
}

export function usePlatformAuditFilters() {
  return useQuery({
    queryKey: ['admin-audit', 'filters'],
    queryFn: async () => (await api.get<ActivityFilterOptions>('/admin/audit-logs/filters/')).data,
  })
}

// --- Support (business side) ------------------------------------------------------------------------
export function useTickets(businessId: string | null, params: ListParams) {
  return useQuery({
    queryKey: ['support', businessId, 'list', clean(params)],
    enabled: Boolean(businessId),
    placeholderData: keepPreviousData,
    queryFn: async () => (await api.get<Paginated<Ticket>>('/support/tickets/', { params: clean(params) })).data,
  })
}

export function useTicketSummary(businessId: string | null) {
  return useQuery({
    queryKey: ['support', businessId, 'summary'],
    enabled: Boolean(businessId),
    queryFn: async () => (await api.get<TicketSummary>('/support/tickets/summary/')).data,
  })
}

export function useTicket(businessId: string | null, id: string | null) {
  return useQuery({
    queryKey: ['support', businessId, 'detail', id],
    enabled: Boolean(businessId && id),
    queryFn: async () => (await api.get<TicketDetail>(`/support/tickets/${id}/`)).data,
  })
}

export function useCreateTicket() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: TicketInput) => (await api.post<TicketDetail>('/support/tickets/', input)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['support'] }),
  })
}

export function useTicketReply() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: string }) =>
      (await api.post<TicketDetail>(`/support/tickets/${id}/reply/`, { body })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['support'] }),
  })
}

export function useTicketStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: TicketStatus }) =>
      (await api.post<TicketDetail>(`/support/tickets/${id}/status/`, { status })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['support'] }),
  })
}

// --- Support (Support Admin) -----------------------------------------------------------------------
export function useAdminTickets(params: ListParams) {
  return useQuery({
    queryKey: ['admin-support', 'list', clean(params)],
    placeholderData: keepPreviousData,
    queryFn: async () => (await api.get<Paginated<AdminTicket>>('/admin/support/tickets/', { params: clean(params) })).data,
  })
}

export function useAdminTicketSummary(enabled = true) {
  return useQuery({
    queryKey: ['admin-support', 'summary'],
    enabled,
    queryFn: async () => (await api.get<TicketSummary>('/admin/support/tickets/summary/')).data,
  })
}

export function useAdminTicket(id: string | null) {
  return useQuery({
    queryKey: ['admin-support', 'detail', id],
    enabled: Boolean(id),
    queryFn: async () => (await api.get<AdminTicketDetail>(`/admin/support/tickets/${id}/`)).data,
  })
}

export function useSupportAgents() {
  return useQuery({
    queryKey: ['admin-support', 'agents'],
    staleTime: 5 * 60_000,
    queryFn: async () => (await api.get<StaffBrief[]>('/admin/support/tickets/agents/')).data,
  })
}

export function useAdminTicketAction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (
      input:
        | { id: string; kind: 'reply'; body: string; internal: boolean; status?: TicketStatus }
        | { id: string; kind: 'status'; status: TicketStatus }
        | { id: string; kind: 'update'; assigned_to?: string | null; priority?: TicketPriority; category?: TicketCategory },
    ) => {
      const base = `/admin/support/tickets/${input.id}/`
      if (input.kind === 'reply') {
        return (await api.post<AdminTicketDetail>(`${base}reply/`, { body: input.body, internal: input.internal, status: input.status })).data
      }
      if (input.kind === 'status') return (await api.post<AdminTicketDetail>(`${base}status/`, { status: input.status })).data
      const patch = { assigned_to: input.assigned_to, priority: input.priority, category: input.category }
      return (await api.patch<AdminTicketDetail>(base, Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)))).data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-support'] }),
  })
}
