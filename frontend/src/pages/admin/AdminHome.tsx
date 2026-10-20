import { Navigate } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthContext'

/** First admin section the signed-in user may open (Super Admins land on the dashboard). */
const LANDING: [string, string][] = [
  ['platform.dashboard.view', '/admin/dashboard'],
  ['platform.support.view', '/admin/support'],
  ['platform.plan.view', '/admin/plans'],
  ['platform.subscription.view', '/admin/subscriptions'],
  ['platform.payment.view', '/admin/payments'],
]

export function AdminBillingHome() {
  const { user } = useAuth()
  const target = LANDING.find(([code]) => user?.platform_permissions.includes(code))?.[1]
  return target ? <Navigate to={target} replace /> : <p className="text-sm text-muted">No admin sections available.</p>
}
