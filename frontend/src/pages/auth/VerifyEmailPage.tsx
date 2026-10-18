import { useMutation } from '@tanstack/react-query'
import { CircleCheck, CircleX } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { authApi } from '@/api/auth'
import { buttonClasses } from '@/components/ui/buttonStyles'
import { Spinner } from '@/components/ui/Feedback'
import { useAuth } from '@/features/auth/AuthContext'

export function VerifyEmailPage() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const { user, setUser, status } = useAuth()
  const started = useRef(false)
  const verify = useMutation({ mutationFn: authApi.verifyEmail })

  useEffect(() => {
    if (!token || started.current) return
    started.current = true
    verify.mutate(token)
  }, [token, verify])

  // Reflect the new status in the signed-in session.
  useEffect(() => {
    if (verify.isSuccess && user && user.email === verify.data.email && !user.is_email_verified) {
      setUser({ ...user, is_email_verified: true })
    }
  }, [verify.isSuccess, verify.data, user, setUser])

  const next = status === 'authenticated' ? '/businesses' : '/login'

  if (!token || verify.isError) {
    return (
      <div className="text-center">
        <CircleX className="mx-auto size-12 text-red-500" aria-hidden />
        <h1 className="mt-4 text-2xl font-bold">Verification link not valid</h1>
        <p className="mt-2 text-sm text-muted">
          {verify.error?.message ?? 'This link is incomplete.'} Sign in and use “Resend link” to get a new one.
        </p>
        <Link to={next} className={buttonClasses('primary', 'lg', 'mt-6')}>
          Continue
        </Link>
      </div>
    )
  }

  if (!verify.isSuccess) return <Spinner label="Verifying your email…" />

  return (
    <div className="text-center">
      <CircleCheck className="mx-auto size-12 text-emerald-600" aria-hidden />
      <h1 className="mt-4 text-2xl font-bold">Email verified</h1>
      <p className="mt-2 text-sm text-muted">
        <strong className="text-ink">{verify.data.email}</strong> is confirmed. Thanks!
      </p>
      <Link to={next} className={buttonClasses('primary', 'lg', 'mt-6')}>
        Continue
      </Link>
    </div>
  )
}
