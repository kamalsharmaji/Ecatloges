import { ArrowLeft, Lock } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useCheckout, useQuote, useScheduleDowngrade } from '@/api/billing'
import { ApiError } from '@/api/client'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader, PageHeader } from '@/components/ui/Card'
import { Alert, ErrorState, Spinner } from '@/components/ui/Feedback'
import { VerifyEmailBanner } from '@/components/VerifyEmailBanner'
import { useActiveBusiness } from '@/features/business/BusinessContext'
import { formatDate, formatMoney, intervalLabel, limitLines, PAYMENT_KIND } from '@/features/billing/format'
import { RequirePermission } from '@/routes/guards'

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 py-1.5 ${strong ? 'text-base font-semibold' : 'text-sm'}`}>
      <dt className={strong ? '' : 'text-muted'}>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

export function CheckoutPage() {
  const { planId = '' } = useParams()
  const { businessId } = useActiveBusiness()
  const navigate = useNavigate()
  const quote = useQuote(businessId, planId)
  const checkout = useCheckout()
  const downgrade = useScheduleDowngrade()

  const emailBlocked = checkout.error instanceof ApiError && checkout.error.code === 'email_not_verified'

  return (
    <RequirePermission codes={['subscription.manage']}>
      <Link to="/app/billing/plans" className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline">
        <ArrowLeft className="size-4" aria-hidden /> All plans
      </Link>
      <PageHeader title="Review your order" />
      {quote.isPending ? (
        <Spinner />
      ) : quote.isError ? (
        <ErrorState error={quote.error} onRetry={() => quote.refetch()} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <Card>
            <CardHeader title={quote.data.plan.name} description={PAYMENT_KIND[quote.data.kind]} />
            <CardBody>
              <ul className="grid gap-1.5 text-sm sm:grid-cols-2">
                {limitLines(quote.data.plan).map((line) => (
                  <li key={line}>• {line}</li>
                ))}
              </ul>
              {quote.data.plan.is_development_seed && (
                <Alert tone="warning" className="mt-4">
                  This is a development placeholder plan; its price and limits are not final.
                </Alert>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Summary" />
            <CardBody className="space-y-4">
              <dl>
                <Row
                  label={`${quote.data.plan.name} (per ${intervalLabel(quote.data.plan.interval)})`}
                  value={formatMoney(quote.data.subtotal, quote.data.currency)}
                />
                {Number(quote.data.tax_rate) > 0 ? (
                  <Row
                    label={`${quote.data.tax_name || 'Tax'} ${quote.data.tax_rate}%${quote.data.tax_inclusive ? ' (included)' : ''}`}
                    value={formatMoney(quote.data.tax_amount, quote.data.currency)}
                  />
                ) : (
                  <Row label="Tax" value="Not applied" />
                )}
                <div className="my-2 border-t border-border" />
                <Row label="Total due today" value={formatMoney(quote.data.total, quote.data.currency)} strong />
              </dl>
              <p className="text-xs text-muted">
                {quote.data.kind === 'downgrade'
                  ? 'Downgrades start when your current period ends.'
                  : `Covers ${formatDate(quote.data.period_start)} – ${formatDate(quote.data.period_end)}.`}
              </p>

              {quote.data.blockers
                .filter((b) => b.code !== 'downgrade_must_be_scheduled')
                .map((b) => (
                  <Alert key={b.code} tone="error">
                    {b.message}
                  </Alert>
                ))}
              {emailBlocked && <VerifyEmailBanner />}
              {checkout.isError && !emailBlocked && <Alert tone="error">{checkout.error.message}</Alert>}
              {downgrade.isError && <Alert tone="error">{downgrade.error.message}</Alert>}

              {quote.data.kind === 'downgrade' ? (
                <Button
                  size="lg"
                  className="w-full"
                  loading={downgrade.isPending}
                  disabled={quote.data.blockers.some((b) => b.code !== 'downgrade_must_be_scheduled')}
                  onClick={() =>
                    downgrade.mutate({ plan_id: planId }, { onSuccess: () => navigate('/app/billing', { replace: true }) })
                  }
                >
                  Schedule downgrade for period end
                </Button>
              ) : (
                <Button
                  size="lg"
                  className="w-full"
                  icon={<Lock className="size-4" />}
                  loading={checkout.isPending}
                  disabled={!quote.data.can_checkout}
                  onClick={() =>
                    checkout.mutate(planId, {
                      onSuccess: (payment) => navigate(`/app/billing/payments/${payment.id}`, { replace: true }),
                    })
                  }
                >
                  Continue to payment
                </Button>
              )}
              <p className="text-center text-xs text-muted">
                Your plan is activated only after the payment provider confirms the payment.
              </p>
            </CardBody>
          </Card>
        </div>
      )}
    </RequirePermission>
  )
}
