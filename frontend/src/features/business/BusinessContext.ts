import { createContext, useContext } from 'react'
import type { BusinessContext } from '@/types/api'

export interface ActiveBusinessValue {
  businessId: string | null
  context: BusinessContext | undefined
  isLoading: boolean
  error: unknown
  select: (businessId: string) => void
  clear: () => void
  /**
   * UI hint only (hide buttons the user can't use). The backend enforces every permission
   * independently, so this is never a security boundary.
   */
  can: (...codes: string[]) => boolean
}

export const ActiveBusinessContext = createContext<ActiveBusinessValue | null>(null)

export function useActiveBusiness(): ActiveBusinessValue {
  const ctx = useContext(ActiveBusinessContext)
  if (!ctx) throw new Error('useActiveBusiness must be used inside <BusinessProvider>')
  return ctx
}
