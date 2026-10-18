import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { authApi, type RegisterInput } from '@/api/auth'
import { refreshAccessToken } from '@/api/client'
import { SESSION_EXPIRED_EVENT, session } from '@/api/session'
import { AuthContext, type AuthContextValue, type AuthStatus } from '@/features/auth/AuthContext'
import type { User } from '@/types/api'

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<AuthStatus>(() => (session.getRefreshToken() ? 'loading' : 'anonymous'))
  const [user, setUserState] = useState<User | null>(null)
  const [sessionExpired, setSessionExpired] = useState(false)
  const bootstrapped = useRef(false)

  // Resume a previous session after a page reload.
  useEffect(() => {
    if (bootstrapped.current || !session.getRefreshToken()) return
    bootstrapped.current = true
    refreshAccessToken()
      .then(() => authApi.me())
      .then((me) => {
        setUserState(me)
        setStatus('authenticated')
      })
      .catch(() => {
        session.clear()
        setStatus('anonymous')
      })
  }, [])

  useEffect(() => {
    const onExpired = () => {
      setUserState(null)
      setStatus('anonymous')
      setSessionExpired(true)
      queryClient.clear()
    }
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired)
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired)
  }, [queryClient])

  const startSession = useCallback(
    (data: { access: string; refresh: string; user: User }) => {
      session.setTokens(data)
      queryClient.clear()
      setUserState(data.user)
      setSessionExpired(false)
      setStatus('authenticated')
      return data.user
    },
    [queryClient],
  )

  const login = useCallback(
    async (email: string, password: string) => startSession(await authApi.login(email, password)),
    [startSession],
  )

  const register = useCallback(async (input: RegisterInput) => startSession(await authApi.register(input)), [startSession])

  const logout = useCallback(async () => {
    const refresh = session.getRefreshToken()
    session.clear()
    setUserState(null)
    setStatus('anonymous')
    queryClient.clear()
    if (refresh) await authApi.logout(refresh).catch(() => undefined)
  }, [queryClient])

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      sessionExpired,
      login,
      register,
      logout,
      setUser: setUserState,
      setTokens: (tokens) => session.setTokens(tokens),
    }),
    [status, user, sessionExpired, login, register, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
