import { zodResolver } from '@hookform/resolvers/zod'
import { CircleCheck } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useSearchParams } from 'react-router-dom'
import type { z } from 'zod'
import { authApi } from '@/api/auth'
import { Button } from '@/components/ui/Button'
import { buttonClasses } from '@/components/ui/buttonStyles'
import { Alert } from '@/components/ui/Feedback'
import { TextField } from '@/components/ui/Field'
import { newPasswordSchema } from '@/features/auth/schemas'
import { AuthHeading } from '@/layouts/AuthLayout'
import { applyApiErrors } from '@/utils/formErrors'

type FormValues = z.infer<typeof newPasswordSchema>

export function ResetPasswordPage() {
  const [params] = useSearchParams()
  const uid = params.get('uid') ?? ''
  const token = params.get('token') ?? ''
  const [done, setDone] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(newPasswordSchema),
    defaultValues: { new_password: '', new_password_confirm: '' },
  })

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null)
    try {
      await authApi.confirmPasswordReset({ uid, token, ...values })
      setDone(true)
    } catch (error) {
      setFormError(applyApiErrors(error, setError, ['new_password', 'new_password_confirm']))
    }
  })

  if (!uid || !token) {
    return (
      <Alert tone="error" title="Invalid reset link">
        This link is incomplete. <Link to="/forgot-password" className="font-medium underline">Request a new one</Link>.
      </Alert>
    )
  }

  if (done) {
    return (
      <div className="text-center">
        <CircleCheck className="mx-auto size-12 text-emerald-600" aria-hidden />
        <h1 className="mt-4 text-2xl font-bold">Password updated</h1>
        <p className="mt-2 text-sm text-muted">You've been signed out of all devices. Sign in with your new password.</p>
        <Link to="/login" className={buttonClasses('primary', 'lg', 'mt-6')}>
          Sign in
        </Link>
      </div>
    )
  }

  return (
    <>
      <AuthHeading title="Choose a new password" />
      <form onSubmit={onSubmit} noValidate className="space-y-5">
        {formError && (
          <Alert tone="error">
            {formError}{' '}
            <Link to="/forgot-password" className="font-medium underline">
              Request a new link
            </Link>
          </Alert>
        )}
        <TextField
          label="New password"
          type="password"
          autoComplete="new-password"
          error={errors.new_password?.message}
          {...register('new_password')}
        />
        <TextField
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
          error={errors.new_password_confirm?.message}
          {...register('new_password_confirm')}
        />
        <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
          Update password
        </Button>
      </form>
    </>
  )
}
