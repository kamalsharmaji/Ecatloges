import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowRight, Lock, Mail } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Feedback'
import { TextField } from '@/components/ui/Field'
import { useAuth } from '@/features/auth/AuthContext'
import { AuthHeading } from '@/layouts/AuthLayout'
import { applyApiErrors } from '@/utils/formErrors'

const schema = z.object({
  email: z.string().trim().min(1, 'Enter your email address.').email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.'),
})
type FormValues = z.infer<typeof schema>

export function LoginPage() {
  const { login, sessionExpired } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { email: '', password: '' } })

  const onSubmit = handleSubmit(async ({ email, password }) => {
    setFormError(null)
    try {
      await login(email, password)
      navigate(from && from !== '/login' ? from : '/businesses', { replace: true })
    } catch (error) {
      setFormError(applyApiErrors(error, setError, ['email', 'password']))
    }
  })

  return (
    <>
      <AuthHeading title="Login to your account" subtitle="Enter your credentials to access your dashboard" />
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {sessionExpired && !formError && (
          <Alert tone="warning">Your session has expired. Please sign in again.</Alert>
        )}
        {formError && <Alert tone="error">{formError}</Alert>}
        <TextField label="Email" hideLabel icon={Mail} placeholder="Enter your email address" type="email" autoComplete="email"
          className="h-12" error={errors.email?.message} {...register('email')} />
        <TextField label="Password" hideLabel icon={Lock} placeholder="Enter your password" type="password" autoComplete="current-password"
          className="h-12" error={errors.password?.message} {...register('password')} />
        <div className="text-right">
          <Link to="/forgot-password" className="text-sm font-medium text-brand-700 underline underline-offset-2">
            Forgot Password?
          </Link>
        </div>
        <Button type="submit" size="lg" className="h-[52px] w-full text-[17px]" loading={isSubmitting}>
          Log In <ArrowRight className="size-5" aria-hidden />
        </Button>
        <p className="pt-3 text-center text-[14px] text-ink">
          New to myEcatalogues?{' '}
          <Link to="/register" className="font-medium text-brand-700 underline underline-offset-2">Create an Account</Link>
        </p>
      </form>
    </>
  )
}
