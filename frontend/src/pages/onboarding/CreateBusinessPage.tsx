import { useNavigate } from 'react-router-dom'
import { useCreateBusiness } from '@/api/businesses'
import { Card, CardBody } from '@/components/ui/Card'
import { useAuth } from '@/features/auth/AuthContext'
import { BusinessForm } from '@/features/business/BusinessForm'
import { useActiveBusiness } from '@/features/business/BusinessContext'

export function CreateBusinessPage() {
  const { user } = useAuth()
  const { select } = useActiveBusiness()
  const navigate = useNavigate()
  const create = useCreateBusiness()

  return (
    <div className="mx-auto max-w-3xl">
      <ol className="mb-6 flex flex-wrap gap-2 text-xs font-medium" aria-label="Setup progress">
        <li className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700">1. Account ✓</li>
        <li className="rounded-full bg-brand-700 px-3 py-1 text-white" aria-current="step">
          2. Business details
        </li>
        <li className="rounded-full bg-slate-100 px-3 py-1 text-slate-500">3. Choose a plan</li>
      </ol>
      <h1 className="text-2xl font-bold tracking-tight">Tell us about your business</h1>
      <p className="mt-1 text-sm text-muted">
        These details appear on your catalogues and help customers reach you. You can change them later.
      </p>
      <Card className="mt-6">
        <CardBody>
          <BusinessForm
            submitLabel="Create business"
            defaults={{ owner_name: user?.full_name ?? '', email: user?.email ?? '', phone: user?.phone ?? '' }}
            onSubmit={async (values) => {
              const business = await create.mutateAsync(values)
              select(business.id)
              // Step 3 of onboarding: choose a plan (paid features unlock after verified payment).
              navigate('/app/billing/plans', { replace: true })
              return business
            }}
          />
        </CardBody>
      </Card>
    </div>
  )
}
