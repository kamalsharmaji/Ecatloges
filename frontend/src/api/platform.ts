import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { ListParams } from '@/api/content'
import type { Paginated } from '@/types/api'
import type {
  AdminBusiness,
  AdminBusinessDetail,
  AdminCatalogue,
  AdminUser,
  AdminUserDetail,
  BusinessSummary,
  CatalogueSummary,
  DashboardData,
  PlatformRole,
  SystemStatus,
  UserSummary,
} from '@/types/platform'

const clean = (p: ListParams): ListParams => Object.fromEntries(Object.entries(p).filter(([, v]) => v !== '' && v !== undefined))
const tz = () => Intl.DateTimeFormat().resolvedOptions().timeZone

export function usePlatformDashboard(range: { from: string; to: string }) {
  return useQuery({
    queryKey: ['platform', 'dashboard', range],
    placeholderData: keepPreviousData,
    queryFn: async () => (await api.get<DashboardData>('/admin/dashboard/', { params: { ...range, tz: tz() } })).data,
  })
}

export function useSystemStatus(enabled = true) {
  return useQuery({
    queryKey: ['platform', 'system'],
    enabled,
    queryFn: async () => (await api.get<SystemStatus>('/admin/system/')).data,
  })
}

// --- Businesses ---------------------------------------------------------------------------------
export function useAdminBusinesses(params: ListParams) {
  return useQuery({
    queryKey: ['platform', 'businesses', clean(params)],
    placeholderData: keepPreviousData,
    queryFn: async () => (await api.get<Paginated<AdminBusiness>>('/admin/businesses/', { params: clean(params) })).data,
  })
}

export function useAdminBusinessSummary() {
  return useQuery({
    queryKey: ['platform', 'businesses', 'summary'],
    queryFn: async () => (await api.get<BusinessSummary>('/admin/businesses/summary/')).data,
  })
}

export function useAdminBusiness(id: string | null) {
  return useQuery({
    queryKey: ['platform', 'businesses', 'detail', id],
    enabled: Boolean(id),
    queryFn: async () => (await api.get<AdminBusinessDetail>(`/admin/businesses/${id}/`)).data,
  })
}

export function useBusinessStatusAction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, action, reason }: { id: string; action: 'suspend' | 'reactivate'; reason: string }) =>
      (await api.post<AdminBusinessDetail>(`/admin/businesses/${id}/${action}/`, { reason })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['platform'] }),
  })
}

// --- Users ------------------------------------------------------------------------------------------
export function useAdminUsers(params: ListParams) {
  return useQuery({
    queryKey: ['platform', 'users', clean(params)],
    placeholderData: keepPreviousData,
    queryFn: async () => (await api.get<Paginated<AdminUser>>('/admin/users/', { params: clean(params) })).data,
  })
}

export function useAdminUserSummary() {
  return useQuery({
    queryKey: ['platform', 'users', 'summary'],
    queryFn: async () => (await api.get<UserSummary>('/admin/users/summary/')).data,
  })
}

export function useAdminUser(id: string | null) {
  return useQuery({
    queryKey: ['platform', 'users', 'detail', id],
    enabled: Boolean(id),
    queryFn: async () => (await api.get<AdminUserDetail>(`/admin/users/${id}/`)).data,
  })
}

export function useUpdateAdminUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...input }: { id: string; is_active?: boolean; platform_role?: PlatformRole }) =>
      (await api.patch<AdminUserDetail>(`/admin/users/${id}/`, input)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['platform'] }),
  })
}

// --- Catalogues ------------------------------------------------------------------------------------
export function useAdminCatalogues(params: ListParams) {
  return useQuery({
    queryKey: ['platform', 'catalogues', clean(params)],
    placeholderData: keepPreviousData,
    queryFn: async () => (await api.get<Paginated<AdminCatalogue>>('/admin/catalogues/', { params: clean(params) })).data,
  })
}

export function useAdminCatalogueSummary() {
  return useQuery({
    queryKey: ['platform', 'catalogues', 'summary'],
    queryFn: async () => (await api.get<CatalogueSummary>('/admin/catalogues/summary/')).data,
  })
}

export function useTakedownCatalogue() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) =>
      (await api.post<AdminCatalogue>(`/admin/catalogues/${id}/unpublish/`, { reason })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['platform'] }),
  })
}

export async function downloadAdminQr(c: { id: string; slug: string }, type: 'png' | 'svg') {
  const url = await fetchAdminQr(c.id, type)
  const a = document.createElement('a')
  a.href = url
  a.download = `${c.slug}-qr.${type}`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Fetch a catalogue QR via the authenticated API and return an object URL (caller revokes it). */
export async function fetchAdminQr(id: string, type: 'png' | 'svg' = 'png'): Promise<string> {
  const response = await api.get<Blob>(`/admin/catalogues/${id}/qr/`, { params: { type }, responseType: 'blob' })
  return URL.createObjectURL(response.data)
}
