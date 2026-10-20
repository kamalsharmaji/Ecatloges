import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { ListParams } from '@/api/content'
import type { Paginated } from '@/types/api'
import type {
  Announcement,
  AnnouncementAudience,
  AnnouncementFeedItem,
  AnnouncementInput,
  BusinessOption,
  BusinessSettings,
  BusinessSettingsInput,
  EmailPreview,
  EmailTemplate,
  NotificationPreference,
  PreferenceChange,
} from '@/types/settings'

const clean = (p: ListParams): ListParams => Object.fromEntries(Object.entries(p).filter(([, v]) => v !== '' && v !== undefined))

// --- Business settings (branding & catalogue defaults) ------------------------------------------
export function useBusinessSettings(businessId: string | null) {
  return useQuery({
    queryKey: ['business-settings', businessId],
    enabled: Boolean(businessId),
    queryFn: async () => (await api.get<BusinessSettings>('/business-settings/')).data,
  })
}

export function useUpdateBusinessSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: BusinessSettingsInput) => (await api.patch<BusinessSettings>('/business-settings/', input)).data,
    onSuccess: (data) => {
      qc.setQueriesData({ queryKey: ['business-settings'] }, data)
    },
  })
}

// --- Notification preferences (always the signed-in user's own) --------------------------------
export function useNotificationPreferences() {
  return useQuery({
    queryKey: ['notification-preferences'],
    queryFn: async () => (await api.get<NotificationPreference[]>('/notifications/preferences/')).data,
  })
}

export function useUpdateNotificationPreferences() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (preferences: PreferenceChange[]) =>
      (await api.patch<NotificationPreference[]>('/notifications/preferences/', { preferences })).data,
    onSuccess: (data) => qc.setQueryData(['notification-preferences'], data),
  })
}

// --- Announcement feed --------------------------------------------------------------------------
export function useAnnouncementFeed() {
  return useQuery({
    queryKey: ['announcement-feed'],
    staleTime: 5 * 60_000,
    queryFn: async () => (await api.get<AnnouncementFeedItem[]>('/announcements/')).data,
  })
}

// --- Announcements (Super Admin) ---------------------------------------------------------------
export function useAdminAnnouncements(params: ListParams) {
  return useQuery({
    queryKey: ['admin-announcements', clean(params)],
    placeholderData: keepPreviousData,
    queryFn: async () => (await api.get<Paginated<Announcement>>('/admin/announcements/', { params: clean(params) })).data,
  })
}

export function useSaveAnnouncement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...input }: Partial<AnnouncementInput> & { id?: string }) =>
      id
        ? (await api.patch<Announcement>(`/admin/announcements/${id}/`, input)).data
        : (await api.post<Announcement>('/admin/announcements/', input)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-announcements'] }),
  })
}

export function useAnnouncementAction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, action }: { id: string; action: 'publish' | 'unpublish' | 'archive' }) =>
      (await api.post<Announcement>(`/admin/announcements/${id}/${action}/`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-announcements'] })
      qc.invalidateQueries({ queryKey: ['announcement-feed'] })
      qc.invalidateQueries({ queryKey: ['notifications'] })
    },
  })
}

export function useAudienceCount(audience: AnnouncementAudience, businessIds: string[], enabled = true) {
  return useQuery({
    queryKey: ['admin-announcements', 'audience', audience, businessIds],
    enabled,
    queryFn: async () =>
      (await api.post<{ recipients: number }>('/admin/announcements/audience-count/', { audience, business_ids: businessIds })).data,
  })
}

export function useBusinessOptions(search: string) {
  return useQuery({
    queryKey: ['admin-announcements', 'business-options', search],
    placeholderData: keepPreviousData,
    queryFn: async () => (await api.get<BusinessOption[]>('/admin/announcements/business-options/', { params: clean({ search }) })).data,
  })
}

// --- Email templates (Super Admin) -------------------------------------------------------------
export function useEmailTemplates() {
  return useQuery({
    queryKey: ['admin-email-templates'],
    queryFn: async () => (await api.get<EmailTemplate[]>('/admin/email-templates/')).data,
  })
}

export function useSaveEmailTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ key, ...input }: { key: string; subject: string; body: string; is_active: boolean }) =>
      (await api.put<EmailTemplate>(`/admin/email-templates/${key}/`, input)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-email-templates'] }),
  })
}

export function useResetEmailTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (key: string) => {
      await api.delete(`/admin/email-templates/${key}/`)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-email-templates'] }),
  })
}

export async function previewEmailTemplate(key: string, draft: { subject: string; body: string }) {
  return (await api.post<EmailPreview>(`/admin/email-templates/${key}/preview/`, draft)).data
}

export function useSendTestEmail() {
  return useMutation({
    mutationFn: async ({ key, ...draft }: { key: string; subject: string; body: string }) =>
      (await api.post<{ sent_to: string }>(`/admin/email-templates/${key}/test/`, draft)).data,
  })
}
