import { CreditCard } from 'lucide-react'
import { useState } from 'react'
import { useBillingOverview, usePlans } from '@/api/billing'
import { PageHeader } from '@/components/ui/Card'
import { Alert, EmptyState, ErrorState, Spinner } from '@/components/ui/Feedback'
import { VerifyEmailBanner } from '@/components/VerifyEmailBanner'
import { PlanCards } from '@/features/billing/PlanCards'
import { useActiveBusiness } from '@/features/business/BusinessContext'
import type { BillingInterval } from '@/types/billing'
import { cn } from '@/utils/cn'

export function PlansPage() {
  const { businessId, can } = useActiveBusiness()
  const [interval, setInterval] = useState<BillingInterval>('month')
  const plans = usePlans(interval)
  const overview = useBillingOverview(businessId, can('subscription.view'))
  const currentPlanId = overview.data?.subscription?.plan.id
  const canBuy = can('subscription.manage')

  return (
    <>
      <PageHeader
        title="Choose your plan"
        description="Pay securely online. Your plan activates as soon as the payment is confirmed."
        action={
          <div role="radiogroup" aria-label="Billing interval" className="inline-flex rounded-lg border border-border bg-white p-1">
            {(['month', 'year'] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={interval === value}
                onClick={() => setInterval(value)}
                className={cn(
                  'rounded-md px-4 py-1.5 text-sm font-medium',
                  interval === value ? 'bg-brand-700 text-white' : 'text-muted hover:text-ink',
                )}
              >
                {value === 'month' ? 'Monthly' : 'Yearly'}
              </button>
            ))}
          </div>
        }
      />
      <div className="space-y-4">
        <VerifyEmailBanner />
        {!canBuy && <Alert tone="info">Only a business owner can buy or change the subscription.</Alert>}
        {overview.data?.payments_test_mode && (
          <Alert tone="warning" title="Test mode">
            Payments use the development mock gateway. No real money is charged.
          </Alert>
        )}
      </div>

      <div className="mt-6">
        {plans.isPending ? (
          <Spinner label="Loading plans…" />
        ) : plans.isError ? (
          <ErrorState error={plans.error} onRetry={() => plans.refetch()} />
        ) : plans.data.length === 0 ? (
          <EmptyState
            icon={CreditCard}
            title="No plans available yet"
            description="Plans haven't been published for this billing interval. Please check back soon or contact support."
          />
        ) : (
          <PlanCards plans={plans.data} currentPlanId={currentPlanId} canBuy={canBuy} />
        )}
      </div>
    </>
  )
}
