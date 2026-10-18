import { createContext, useContext } from 'react'
import type { RegisterInput } from '@/api/auth'
import type { User } from '@/types/api'

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous'

export interface AuthContextValue {
  status: AuthStatus
  user: User | null
  /** True when the user was signed out because the session could not be refreshed. */
  sessionExpired: boolean
  login: (email: string, password: string) => Promise<User>
  register: (input: RegisterInput) => Promise<User>
  logout: () => Promise<void>
  setUser: (user: User) => void
  /** Store a fresh token pair (e.g. after a password change revoked the old ones). */
  setTokens: (tokens: { access: string; refresh: string }) => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
