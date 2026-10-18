import { MailOpen } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAcceptInvitation } from '@/api/businesses'
import { Button } from '@/components/ui/Button'
import { Card, CardBody } from '@/components/ui/Card'
import { Alert } from '@/components/ui/Feedback'
import { useAuth } from '@/features/auth/AuthContext'
import { useActiveBusiness } from '@/features/business/BusinessContext'

export function AcceptInvitationPage() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const { user, setUser } = useAuth()
  const { select } = useActiveBusiness()
  const navigate = useNavigate()
  const accept = useAcceptInvitation()

  const onAccept = () =>
    accept.mutate(token, {
      onSuccess: (membership) => {
        if (user && !user.is_email_verified) setUser({ ...user, is_email_verified: true })
        select(membership.business.id)
        navigate('/app', { replace: true })
      },
    })

  return (
    <Card className="mx-auto max-w-md">
      <CardBody className="text-center">
        <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-brand-50 text-brand-700">
          <MailOpen className="size-6" aria-hidden />
        </span>
        <h1 className="mt-4 text-xl font-bold">Join a business on myEcatalogues</h1>
        <p className="mt-2 text-sm text-muted">
          You're signed in as <strong className="text-ink">{user?.email}</strong>. The invitation must have been sent to
          this address.
        </p>
        {!token && (
          <Alert tone="error" className="mt-4 text-left">
            This invitation link is incomplete.
          </Alert>
        )}
        {accept.isError && (
          <Alert tone="error" className="mt-4 text-left">
            {accept.error.message}
          </Alert>
        )}
        <Button size="lg" className="mt-6 w-full" disabled={!token} loading={accept.isPending} onClick={onAccept}>
          Accept invitation
        </Button>
      </CardBody>
    </Card>
  )
}
