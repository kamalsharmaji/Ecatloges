import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import type {
  Business,
  BusinessContext,
  BusinessInput,
  Invitation,
  Membership,
  MyBusiness,
  Paginated,
  Permission,
  Role,
} from '@/types/api'

export const businessKeys = {
  mine: ['businesses', 'mine'] as const,
  context: (id: string | null) => ['business-context', id] as const,
  members: (id: string | null, params: object) => ['members', id, params] as const,
  invitations: (id: string | null) => ['invitations', id] as const,
  roles: (id: string | null) => ['roles', id] as const,
  permissions: ['permissions'] as const,
}

// --- Businesses -----------------------------------------------------------------------------
export function useMyBusinesses() {
  return useQuery({
    queryKey: businessKeys.mine,
    queryFn: async () => (await api.get<Paginated<MyBusiness>>('/businesses/', { params: { page_size: 100 } })).data,
  })
}

export function useCreateBusiness() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: Partial<BusinessInput>) => (await api.post<Business>('/businesses/', input)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: businessKeys.mine }),
  })
}

export function useUpdateBusiness(businessId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: Partial<BusinessInput>) =>
      (await api.patch<Business>(`/businesses/${businessId}/`, input)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['business-context'] })
      qc.invalidateQueries({ queryKey: businessKeys.mine })
    },
  })
}

export function useBusinessContextQuery(businessId: string | null) {
  return useQuery({
    queryKey: businessKeys.context(businessId),
    enabled: Boolean(businessId),
    queryFn: async () =>
      (await api.get<BusinessContext>('/business-context/', { headers: { 'X-Business-ID': businessId! } })).data,
  })
}

export function useLeaveBusiness() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      await api.post('/business-context/leave/')
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: businessKeys.mine }),
  })
}

// --- Members --------------------------------------------------------------------------------
export interface MemberParams {
  page?: number
  search?: string
  status?: string
}

export function useMembers(businessId: string | null, params: MemberParams) {
  return useQuery({
    queryKey: businessKeys.members(businessId, params),
    enabled: Boolean(businessId),
    placeholderData: keepPreviousData,
    queryFn: async () => (await api.get<Paginated<Membership>>('/members/', { params })).data,
  })
}

function useInvalidateTeam() {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: ['members'] })
    qc.invalidateQueries({ queryKey: ['roles'] })
    qc.invalidateQueries({ queryKey: ['business-context'] })
  }
}

export function useUpdateMember() {
  const invalidate = useInvalidateTeam()
  return useMutation({
    mutationFn: async ({ id, ...input }: { id: string; role_id?: string; status?: string }) =>
      (await api.patch<Membership>(`/members/${id}/`, input)).data,
    onSuccess: invalidate,
  })
}

export function useRemoveMember() {
  const invalidate = useInvalidateTeam()
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/members/${id}/`)
    },
    onSuccess: invalidate,
  })
}

export function useTransferOwnership() {
  const invalidate = useInvalidateTeam()
  return useMutation({
    mutationFn: async (membershipId: string) =>
      (await api.post<Membership>('/members/transfer-ownership/', { membership_id: membershipId })).data,
    onSuccess: invalidate,
  })
}

// --- Invitations ----------------------------------------------------------------------------
export function useInvitations(businessId: string | null) {
  return useQuery({
    queryKey: businessKeys.invitations(businessId),
    enabled: Boolean(businessId),
    queryFn: async () =>
      (await api.get<Paginated<Invitation>>('/invitations/', { params: { status: 'pending', page_size: 100 } })).data,
  })
}

export function useInviteMember() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { email: string; role_id: string }) =>
      (await api.post<Invitation>('/invitations/', input)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invitations'] }),
  })
}

export function useRevokeInvitation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/invitations/${id}/`)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invitations'] }),
  })
}

export function useAcceptInvitation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (token: string) => (await api.post<MyBusiness>('/invitations/accept/', { token })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: businessKeys.mine }),
  })
}

// --- Roles & permissions --------------------------------------------------------------------
export function useRoles(businessId: string | null) {
  return useQuery({
    queryKey: businessKeys.roles(businessId),
    enabled: Boolean(businessId),
    queryFn: async () => (await api.get<Role[]>('/roles/')).data,
  })
}

export function usePermissionCatalogue() {
  return useQuery({
    queryKey: businessKeys.permissions,
    staleTime: Infinity,
    queryFn: async () => (await api.get<Permission[]>('/permissions/')).data,
  })
}

export interface RoleInput {
  name: string
  description: string
  permissions: string[]
}

export function useSaveRole() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...input }: RoleInput & { id?: string }) =>
      id ? (await api.patch<Role>(`/roles/${id}/`, input)).data : (await api.post<Role>('/roles/', input)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['roles'] }),
  })
}

export function useDeleteRole() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/roles/${id}/`)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['roles'] }),
  })
}
