import { useResendVerification } from '@/api/auth'
import { Alert } from '@/components/ui/Feedback'
import { useAuth } from '@/features/auth/AuthContext'

export function VerifyEmailBanner() {
  const { user } = useAuth()
  const resend = useResendVerification()
  if (!user || user.is_email_verified) return null
  return (
    <Alert
      tone="warning"
      title="Please verify your email address"
      action={
        resend.isSuccess ? (
          <span className="text-sm font-medium">Email sent ✓</span>
        ) : (
          <button
            type="button"
            onClick={() => resend.mutate()}
            disabled={resend.isPending}
            className="text-sm font-semibold underline underline-offset-2 disabled:opacity-60"
          >
            {resend.isPending ? 'Sending…' : 'Resend link'}
          </button>
        )
      }
    >
      We sent a verification link to <strong>{user.email}</strong>. You'll need a verified email before subscribing to a plan.
      {resend.isError && <span className="mt-1 block text-red-700">{resend.error.message}</span>}
    </Alert>
  )
}
