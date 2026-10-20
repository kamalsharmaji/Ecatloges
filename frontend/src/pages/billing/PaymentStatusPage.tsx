import { CircleCheck, CircleX, Clock, FlaskConical, LoaderCircle, RefreshCw, ShieldAlert } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  useCancelCheckout,
  useCheckout,
  useConfirmPayment,
  usePayment,
  useRefreshPayment,
  useSimulatePayment,
} from '@/api/billing'
import { Button } from '@/components/ui/Button'
import { buttonClasses } from '@/components/ui/buttonStyles'
import { Card, CardBody } from '@/components/ui/Card'
import { Alert, ErrorState, Spinner } from '@/components/ui/Feedback'
import { useAuth } from '@/features/auth/AuthContext'
import { useActiveBusiness } from '@/features/business/BusinessContext'
import { formatDateTime, formatMoney } from '@/features/billing/format'
import { openRazorpayCheckout } from '@/features/billing/razorpayCheckout'
import { RequirePermission } from '@/routes/guards'
import type { Payment } from '@/types/billing'

function TestModePanel({ payment }: { payment: Payment }) {
  const simulate = useSimulatePayment()
  return (
    <div className="mt-6 rounded-xl border-2 border-dashed border-amber-300 bg-amber-50 p-4 text-left">
      <p className="flex items-center gap-2 text-sm font-semibold text-amber-900">
        <FlaskConical className="size-4" aria-hidden /> Development payment simulator
      </p>
      <p className="mt-1 text-xs text-amber-900">
        Sends a signed webhook from the mock gateway through the real verification pipeline. No money moves. Not
        available in production.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" loading={simulate.isPending} onClick={() => simulate.mutate({ id: payment.id, body: { outcome: 'captured' } })}>
          Simulate successful payment
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={simulate.isPending}
          onClick={() => simulate.mutate({ id: payment.id, body: { outcome: 'failed' } })}
        >
          Simulate failed payment
        </Button>
      </div>
      {simulate.isError && <p className="mt-2 text-xs text-red-700">{simulate.error.message}</p>}
    </div>
  )
}

function PayNow({ payment }: { payment: Payment }) {
  const { user } = useAuth()
  const { context } = useActiveBusiness()
  const confirm = useConfirmPayment()
  const [error, setError] = useState<string | null>(null)
  if (payment.checkout?.provider !== 'razorpay') return null
  return (
    <div className="mt-6 space-y-2">
      <Button
        size="lg"
        className="w-full"
        loading={confirm.isPending}
        onClick={() => {
          setError(null)
          openRazorpayCheckout(payment.checkout!, {
            businessName: 'myEcatalogues',
            description: `${payment.plan_name} for ${context?.business.name ?? ''}`,
            email: user?.email,
            onPaid: (response) => confirm.mutate({ id: payment.id, body: { ...response } }),
            onDismiss: () => undefined,
          }).catch((e: Error) => setError(e.message))
        }}
      >
        Pay {formatMoney(payment.amount, payment.currency)}
      </Button>
      {(error || confirm.isError) && <p className="text-sm text-red-600">{error ?? confirm.error?.message}</p>}
    </div>
  )
}

export function PaymentStatusPage() {
  const { paymentId = '' } = useParams()
  const navigate = useNavigate()
  const payment = usePayment(paymentId, true)
  const refresh = useRefreshPayment()
  const cancel = useCancelCheckout()
  const retry = useCheckout()

  if (payment.isPending) return <Spinner />
  if (payment.isError) return <ErrorState error={payment.error} onRetry={() => payment.refetch()} />
  const p = payment.data

  let icon = <Clock className="mx-auto size-12 text-amber-500" aria-hidden />
  let title = 'Waiting for payment confirmation'
  let message = 'Complete the payment in the payment window. This page updates automatically once the payment provider confirms it.'
  if (p.status === 'captured' && p.applied_at) {
    icon = <CircleCheck className="mx-auto size-12 text-emerald-600" aria-hidden />
    title = 'Payment confirmed'
    message = `Your ${p.plan_name} plan is ${p.kind === 'scheduled_change' ? 'scheduled to start when your current period ends' : 'now active'}.`
  } else if (p.status === 'captured' || p.under_review) {
    icon = <ShieldAlert className="mx-auto size-12 text-amber-500" aria-hidden />
    title = 'Payment received — under review'
    message = 'We received a payment that needs a manual check before your plan changes. Our team will contact you; no action is needed.'
  } else if (p.status === 'failed') {
    icon = <CircleX className="mx-auto size-12 text-red-500" aria-hidden />
    title = 'Payment failed'
    message = p.failure_message || 'The payment did not go through. You have not been charged for this attempt.'
  } else if (p.status === 'expired') {
    icon = <CircleX className="mx-auto size-12 text-slate-400" aria-hidden />
    title = 'Checkout closed'
    message = 'This checkout expired or was replaced. Start again from the plans page.'
  }

  return (
    <RequirePermission codes={['payment.view']}>
      <Card className="mx-auto max-w-lg">
        <CardBody className="py-8 text-center">
          {icon}
          <h1 className="mt-4 text-xl font-bold">{title}</h1>
          <p className="mt-2 text-sm text-muted" aria-live="polite">
            {message}
          </p>
          {p.is_test && (
            <p className="mt-3 inline-block rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900">TEST MODE</p>
          )}

          <dl className="mt-6 space-y-1 rounded-lg bg-canvas p-4 text-left text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">Plan</dt>
              <dd>{p.plan_name}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Amount</dt>
              <dd className="font-medium">{formatMoney(p.amount, p.currency)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Reference</dt>
              <dd className="truncate pl-4 font-mono text-xs">{p.provider_order_id}</dd>
            </div>
            {p.status === 'created' && (
              <div className="flex justify-between">
                <dt className="text-muted">Expires</dt>
                <dd>{formatDateTime(p.expires_at)}</dd>
              </div>
            )}
          </dl>

          {p.status === 'created' && (
            <>
              <PayNow payment={p} />
              {p.checkout?.provider === 'mock' && <TestModePanel payment={p} />}
              <p className="mt-6 flex items-center justify-center gap-2 text-xs text-muted">
                <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> Checking for confirmation…
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<RefreshCw className="size-4" />}
                  loading={refresh.isPending}
                  onClick={() => refresh.mutate({ id: p.id })}
                >
                  Check status now
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  loading={cancel.isPending}
                  onClick={() => cancel.mutate({ id: p.id }, { onSuccess: () => navigate('/app/billing/plans') })}
                >
                  Cancel checkout
                </Button>
              </div>
              {(refresh.isError || cancel.isError) && (
                <Alert tone="error" className="mt-4 text-left">
                  {(refresh.error ?? cancel.error)?.message}
                </Alert>
              )}
            </>
          )}

          {p.status === 'captured' && p.applied_at && (
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <Link to="/app" className={buttonClasses('primary', 'md')}>
                Go to dashboard
              </Link>
              {p.invoice_id && (
                <Link to={`/app/billing/invoices/${p.invoice_id}`} className={buttonClasses('secondary', 'md')}>
                  View invoice
                </Link>
              )}
            </div>
          )}

          {(p.status === 'failed' || p.status === 'expired') && (
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <Button
                loading={retry.isPending}
                onClick={() =>
                  retry.mutate(p.plan_id, { onSuccess: (next) => navigate(`/app/billing/payments/${next.id}`, { replace: true }) })
                }
              >
                Try again
              </Button>
              <Link to="/app/billing/plans" className={buttonClasses('secondary', 'md')}>
                Choose another plan
              </Link>
            </div>
          )}
          {retry.isError && (
            <Alert tone="error" className="mt-4 text-left">
              {retry.error.message}
            </Alert>
          )}
        </CardBody>
      </Card>
    </RequirePermission>
  )
}
