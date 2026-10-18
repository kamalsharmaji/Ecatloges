import { zodResolver } from '@hookform/resolvers/zod'
import { MailCheck } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { z } from 'zod'
import { authApi } from '@/api/auth'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Feedback'
import { TextField } from '@/components/ui/Field'
import { AuthHeading } from '@/layouts/AuthLayout'
import { applyApiErrors } from '@/utils/formErrors'

const schema = z.object({
  email: z.string().trim().min(1, 'Enter your email address.').email('Enter a valid email address.'),
})
type FormValues = z.infer<typeof schema>

export function ForgotPasswordPage() {
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { email: '' } })

  const onSubmit = handleSubmit(async ({ email }) => {
    setFormError(null)
    try {
      await authApi.requestPasswordReset(email)
      setSentTo(email)
    } catch (error) {
      setFormError(applyApiErrors(error, setError, ['email']))
    }
  })

  if (sentTo) {
    return (
      <div className="text-center">
        <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-brand-50 text-brand-700">
          <MailCheck className="size-6" aria-hidden />
        </span>
        <h1 className="mt-4 text-2xl font-bold">Check your inbox</h1>
        <p className="mt-2 text-sm text-muted">
          If an account exists for <strong className="text-ink">{sentTo}</strong>, we've sent a link to reset your
          password. It expires in 1 hour.
        </p>
        <Link to="/login" className="mt-6 inline-block text-sm font-medium text-brand-700 hover:underline">
          Back to sign in
        </Link>
      </div>
    )
  }

  return (
    <>
      <AuthHeading title="Forgot your password?" subtitle="Enter your email and we'll send you a reset link." />
      <form onSubmit={onSubmit} noValidate className="space-y-5">
        {formError && <Alert tone="error">{formError}</Alert>}
        <TextField label="Email" type="email" autoComplete="email" error={errors.email?.message} {...register('email')} />
        <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
          Send reset link
        </Button>
        <p className="text-center text-sm">
          <Link to="/login" className="font-medium text-brand-700 hover:underline">
            Back to sign in
          </Link>
        </p>
      </form>
    </>
  )
}
