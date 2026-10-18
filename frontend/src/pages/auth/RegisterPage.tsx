import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Feedback'
import { Checkbox, TextField } from '@/components/ui/Field'
import { useAuth } from '@/features/auth/AuthContext'
import { passwordSchema } from '@/features/auth/schemas'
import { AuthHeading } from '@/layouts/AuthLayout'
import { applyApiErrors } from '@/utils/formErrors'

const schema = z
  .object({
    full_name: z.string().trim().min(2, 'Enter your full name.').max(150),
    email: z.string().trim().min(1, 'Enter your email address.').email('Enter a valid email address.'),
    phone: z
      .string()
      .trim()
      .regex(/^$|^\+?[0-9][0-9\s\-()]{6,18}$/, 'Enter a valid mobile number.'),
    password: passwordSchema,
    password_confirm: z.string().min(1, 'Confirm your password.'),
    accept_terms: z.boolean().refine((v) => v, 'You must accept the terms and conditions.'),
  })
  .refine((v) => v.password === v.password_confirm, { path: ['password_confirm'], message: 'Passwords do not match.' })
type FormValues = z.infer<typeof schema>

const FIELDS = ['full_name', 'email', 'phone', 'password', 'password_confirm', 'accept_terms'] as const

export function RegisterPage() {
  const { register: registerAccount } = useAuth()
  const navigate = useNavigate()
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { full_name: '', email: '', phone: '', password: '', password_confirm: '', accept_terms: false },
  })

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null)
    try {
      await registerAccount(values)
      navigate('/onboarding', { replace: true })
    } catch (error) {
      setFormError(applyApiErrors(error, setError, FIELDS))
    }
  })

  return (
    <>
      <AuthHeading
        title="Create your account"
        subtitle={
          <>
            Already have an account?{' '}
            <Link to="/login" className="font-medium text-brand-700 hover:underline">
              Sign in
            </Link>
          </>
        }
      />
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {formError && <Alert tone="error">{formError}</Alert>}
        <TextField label="Full name" autoComplete="name" required error={errors.full_name?.message} {...register('full_name')} />
        <TextField label="Email" type="email" autoComplete="email" required error={errors.email?.message} {...register('email')} />
        <TextField
          label="Mobile number"
          type="tel"
          autoComplete="tel"
          placeholder="+91 98765 43210"
          error={errors.phone?.message}
          {...register('phone')}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Password"
            type="password"
            autoComplete="new-password"
            required
            hint="At least 8 characters, not only numbers."
            error={errors.password?.message}
            {...register('password')}
          />
          <TextField
            label="Confirm password"
            type="password"
            autoComplete="new-password"
            required
            error={errors.password_confirm?.message}
            {...register('password_confirm')}
          />
        </div>
        <Checkbox
          label={
            <>
              I agree to the{' '}
              <a href="/terms" target="_blank" rel="noreferrer" className="font-medium text-brand-700 hover:underline">
                terms and conditions
              </a>
              .
            </>
          }
          error={errors.accept_terms?.message}
          {...register('accept_terms')}
        />
        <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
          Create account
        </Button>
        <p className="text-center text-xs text-muted">
          Next you'll add your business details, then choose a plan.
        </p>
      </form>
    </>
  )
}
