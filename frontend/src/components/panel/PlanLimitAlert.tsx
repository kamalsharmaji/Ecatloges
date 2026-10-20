import { Link } from 'react-router-dom'
import { buttonClasses } from '@/components/ui/buttonStyles'
import { Alert } from '@/components/ui/Feedback'
import { isPlanError } from '@/features/content/format'

/** Explains a plan/subscription block (HTTP 402) and links to subscription management. */
export function PlanLimitAlert({ error, className }: { error: unknown; className?: string }) {
  if (!isPlanError(error)) return null
  const noPlan = error.code === 'subscription_required'
  return (
    <Alert
      tone="warning"
      title={noPlan ? 'An active plan is required' : 'Plan limit reached'}
      className={className}
      action={
        <Link to={noPlan ? '/app/billing/plans' : '/app/billing'} className={buttonClasses('primary', 'sm')}>
          {noPlan ? 'Choose a plan' : 'Manage plan'}
        </Link>
      }
    >
      {error.message}
    </Alert>
  )
}
