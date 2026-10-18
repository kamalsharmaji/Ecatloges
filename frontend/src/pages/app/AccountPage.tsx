import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { authApi, useResendVerification } from '@/api/auth'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader, PageHeader } from '@/components/ui/Card'
import { Alert, Badge } from '@/components/ui/Feedback'
import { TextField } from '@/components/ui/Field'
import { useAuth } from '@/features/auth/AuthContext'
import { newPasswordSchema } from '@/features/auth/schemas'
import { LeaveBusinessCard } from '@/features/business/LeaveBusinessCard'
import { applyApiErrors } from '@/utils/formErrors'

const profileSchema = z.object({
  full_name: z.string().trim().min(2, 'Enter your full name.').max(150),
  phone: z.string().trim().regex(/^$|^\+?[0-9][0-9\s\-()]{6,18}$/, 'Enter a valid mobile number.'),
})
type ProfileValues = z.infer<typeof profileSchema>

const passwordSchema = z
  .object({ current_password: z.string().min(1, 'Enter your current password.') })
  .and(newPasswordSchema)
type PasswordValues = z.infer<typeof passwordSchema>

function ProfileForm() {
  const { user, setUser } = useAuth()
  const [status, setStatus] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { full_name: user?.full_name ?? '', phone: user?.phone ?? '' },
  })

  const onSubmit = handleSubmit(async (values) => {
    setStatus(null)
    try {
      const updated = await authApi.updateMe(values)
      setUser(updated)
      reset({ full_name: updated.full_name, phone: updated.phone })
      setStatus({ tone: 'success', text: 'Profile updated.' })
    } catch (error) {
      const message = applyApiErrors(error, setError, ['full_name', 'phone'])
      if (message) setStatus({ tone: 'error', text: message })
    }
  })

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {status && <Alert tone={status.tone}>{status.text}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Full name" autoComplete="name" error={errors.full_name?.message} {...register('full_name')} />
        <TextField label="Mobile number" type="tel" autoComplete="tel" error={errors.phone?.message} {...register('phone')} />
      </div>
      <div className="flex justify-end">
        <Button type="submit" loading={isSubmitting} disabled={!isDirty}>
          Save profile
        </Button>
      </div>
    </form>
  )
}

function PasswordForm() {
  const { setTokens } = useAuth()
  const [status, setStatus] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { current_password: '', new_password: '', new_password_confirm: '' },
  })

  const onSubmit = handleSubmit(async (values) => {
    setStatus(null)
    try {
      const tokens = await authApi.changePassword(values)
      setTokens(tokens)
      reset()
      setStatus({ tone: 'success', text: 'Password changed. Other devices have been signed out.' })
    } catch (error) {
      const message = applyApiErrors(error, setError, ['current_password', 'new_password', 'new_password_confirm'])
      if (message) setStatus({ tone: 'error', text: message })
    }
  })

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {status && <Alert tone={status.tone}>{status.text}</Alert>}
      <TextField
        label="Current password"
        type="password"
        autoComplete="current-password"
        error={errors.current_password?.message}
        {...register('current_password')}
      />
      <div className="grid gap-4 sm:grid-cols-2">
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
      </div>
      <div className="flex justify-end">
        <Button type="submit" loading={isSubmitting}>
          Change password
        </Button>
      </div>
    </form>
  )
}

export function AccountPage() {
  const { user } = useAuth()
  const resend = useResendVerification()
  if (!user) return null

  return (
    <>
      <PageHeader title="My account" description="Your personal profile. It's shared across all your businesses." />
      <div className="space-y-6">
        <Card>
          <CardHeader title="Email address" />
          <CardBody className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{user.email}</span>
              {user.is_email_verified ? <Badge tone="success">Verified</Badge> : <Badge tone="warning">Not verified</Badge>}
            </div>
            {!user.is_email_verified && (
              <Button
                variant="secondary"
                size="sm"
                loading={resend.isPending}
                disabled={resend.isSuccess}
                onClick={() => resend.mutate()}
              >
                {resend.isSuccess ? 'Verification email sent' : 'Resend verification email'}
              </Button>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Profile" />
          <CardBody>
            <ProfileForm />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Password" description="Changing your password signs you out on every other device." />
          <CardBody>
            <PasswordForm />
          </CardBody>
        </Card>
        <LeaveBusinessCard />
      </div>
    </>
  )
}
