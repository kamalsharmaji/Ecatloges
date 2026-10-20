import { ChevronRight, Plus } from 'lucide-react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useMyBusinesses } from '@/api/businesses'
import { buttonClasses } from '@/components/ui/buttonStyles'
import { Badge, ErrorState, Spinner } from '@/components/ui/Feedback'
import { useAuth } from '@/features/auth/AuthContext'
import { useActiveBusiness } from '@/features/business/BusinessContext'
import { categoryLabel } from '@/features/business/constants'
import type { MyBusiness } from '@/types/api'

function isUsable(m: MyBusiness) {
  return m.membership_status === 'active' && m.business.status === 'active'
}

export function SelectBusinessPage() {
  const { data, isPending, error, refetch } = useMyBusinesses()
  const { select, businessId } = useActiveBusiness()
  const { user } = useAuth()
  const navigate = useNavigate()

  if (isPending) return <Spinner />
  if (error) return <ErrorState error={error} onRetry={() => refetch()} />

  const memberships = data.results
  // Platform staff usually have no business of their own; send them to the admin panel instead.
  if (memberships.length === 0) return <Navigate to={user?.platform_permissions.length ? '/admin' : '/onboarding'} replace />

  const open = (m: MyBusiness) => {
    select(m.business.id)
    navigate('/app')
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Choose a business</h1>
          <p className="mt-1 text-sm text-muted">You're a member of {memberships.length} business{memberships.length > 1 ? 'es' : ''}.</p>
        </div>
        <Link to="/onboarding" className={buttonClasses('secondary', 'md')}>
          <Plus className="size-4" aria-hidden /> New business
        </Link>
      </div>

      <ul className="space-y-3">
          {memberships.map((m) => {
            const usable = isUsable(m)
            return (
              <li key={m.membership_id}>
                <button
                  type="button"
                  disabled={!usable}
                  onClick={() => open(m)}
                  className="flex w-full items-center gap-4 rounded-xl border border-border bg-white p-4 text-left shadow-sm transition hover:border-brand-300 hover:shadow disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-border"
                >
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-lg font-bold text-brand-700">
                    {m.business.name[0]?.toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-semibold">{m.business.name}</span>
                      {m.business.id === businessId && <Badge tone="brand">Current</Badge>}
                      {m.business.status !== 'active' && <Badge tone="danger">Business suspended</Badge>}
                      {m.membership_status !== 'active' && <Badge tone="warning">Access suspended</Badge>}
                    </span>
                    <span className="mt-0.5 block text-sm text-muted">
                      {m.role.name} · {categoryLabel(m.business.category)}
                      {m.business.city && ` · ${m.business.city}`}
                    </span>
                  </span>
                  {usable && <ChevronRight className="size-5 text-muted" aria-hidden />}
                </button>
              </li>
            )
          })}
        </ul>
    </div>
  )
}
