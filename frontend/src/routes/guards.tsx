import { ShieldAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { EmptyState, ErrorState, FullPageSpinner } from '@/components/ui/Feedback'
import { useAuth } from '@/features/auth/AuthContext'
import { useActiveBusiness } from '@/features/business/BusinessContext'

/**
 * Route guards improve UX only. Every API call is authorised by the backend independently,
 * so bypassing these in the browser exposes nothing.
 */
export function RequireAuth() {
  const { status } = useAuth()
  const location = useLocation()
  if (status === 'loading') return <FullPageSpinner />
  if (status === 'anonymous') {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  }
  return <Outlet />
}

export function GuestOnly() {
  const { status } = useAuth()
  if (status === 'loading') return <FullPageSpinner />
  if (status === 'authenticated') return <Navigate to="/businesses" replace />
  return <Outlet />
}

export function RequireBusiness() {
  const { businessId, context, isLoading, error } = useActiveBusiness()
  if (!businessId) return <Navigate to="/businesses" replace />
  if (isLoading) return <FullPageSpinner />
  if (!context) {
    return (
      <div className="mx-auto max-w-lg p-8">
        <ErrorState error={error} onRetry={() => window.location.reload()} />
      </div>
    )
  }
  return <Outlet />
}

export function RequirePermission({ codes, children }: { codes: string[]; children: ReactNode }) {
  const { can } = useActiveBusiness()
  if (!can(...codes)) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="You don't have access to this page"
        description="Ask a business owner or admin to update your role if you need access."
      />
    )
  }
  return <>{children}</>
}
