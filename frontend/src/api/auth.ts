import { useMutation } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { AuthResponse, User } from '@/types/api'

export interface RegisterInput {
  email: string
  full_name: string
  phone?: string
  password: string
  password_confirm: string
  accept_terms: boolean
}

export const authApi = {
  login: async (email: string, password: string) =>
    (await api.post<AuthResponse>('/auth/login/', { email, password })).data,
  register: async (input: RegisterInput) => (await api.post<AuthResponse>('/auth/register/', input)).data,
  logout: async (refresh: string) => {
    await api.post('/auth/logout/', { refresh })
  },
  me: async () => (await api.get<User>('/auth/me/')).data,
  updateMe: async (input: Partial<Pick<User, 'full_name' | 'phone'>>) =>
    (await api.patch<User>('/auth/me/', input)).data,
  changePassword: async (input: { current_password: string; new_password: string; new_password_confirm: string }) =>
    (await api.post<AuthResponse>('/auth/change-password/', input)).data,
  verifyEmail: async (token: string) =>
    (await api.post<{ email: string; is_email_verified: boolean }>('/auth/verify-email/', { token })).data,
  resendVerification: async () => (await api.post<{ detail: string }>('/auth/verify-email/resend/')).data,
  requestPasswordReset: async (email: string) =>
    (await api.post<{ detail: string }>('/auth/password-reset/', { email })).data,
  confirmPasswordReset: async (input: { uid: string; token: string; new_password: string; new_password_confirm: string }) =>
    (await api.post<{ detail: string }>('/auth/password-reset/confirm/', input)).data,
}

export function useResendVerification() {
  return useMutation({ mutationFn: authApi.resendVerification })
}
