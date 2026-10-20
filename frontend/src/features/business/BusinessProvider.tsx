import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useBusinessContextQuery } from '@/api/businesses'
import { ApiError } from '@/api/client'
import { session } from '@/api/session'
import { useAuth } from '@/features/auth/AuthContext'
import { ActiveBusinessContext, type ActiveBusinessValue } from '@/features/business/BusinessContext'

/** Query keys whose data belongs to one business and must be dropped when switching. */
const SCOPED_KEYS = ['business-context', 'members', 'invitations', 'roles', 'billing', 'catalogues', 'products', 'categories', 'media', 'enquiries', 'customers', 'analytics', 'activity', 'support', 'business-settings']

export function BusinessProvider({ children }: { children: ReactNode }) {
  const { status } = useAuth()
  const queryClient = useQueryClient()
  const [businessId, setBusinessId] = useState<string | null>(() => session.getBusinessId())

  // Logging out clears storage; mirror it in state.
  useEffect(() => {
    if (status === 'anonymous') setBusinessId(null)
  }, [status])

  const query = useBusinessContextQuery(status === 'authenticated' ? businessId : null)

  const clear = useCallback(() => {
    session.setBusinessId(null)
    setBusinessId(null)
  }, [])

  // Lost access (removed, suspended, business suspended): drop the stale selection.
  useEffect(() => {
    if (query.error instanceof ApiError && [403, 404].includes(query.error.status)) clear()
  }, [query.error, clear])

  const select = useCallback(
    (id: string) => {
      for (const key of SCOPED_KEYS) queryClient.removeQueries({ queryKey: [key] })
      session.setBusinessId(id)
      setBusinessId(id)
    },
    [queryClient],
  )

  const value = useMemo<ActiveBusinessValue>(() => {
    const permissions = new Set(query.data?.permissions ?? [])
    return {
      businessId,
      context: query.data,
      isLoading: query.isPending && Boolean(businessId),
      error: query.error,
      select,
      clear,
      can: (...codes) => codes.every((c) => permissions.has(c)),
    }
  }, [businessId, query.data, query.isPending, query.error, select, clear])

  return <ActiveBusinessContext.Provider value={value}>{children}</ActiveBusinessContext.Provider>
}
