import { zodResolver } from '@hookform/resolvers/zod'
import {
  CircleAlert,
  CircleCheck,
  Copy,
  Download,
  KeyRound,
  Laptop,
  LogOut,
  Monitor,
  MonitorSmartphone,
  RefreshCw,
  ShieldCheck,
  ShieldOff,
  Smartphone,
  Trash2,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { z } from 'zod'
import {
  useMfaConfirm,
  useMfaDisable,
  useMfaSetup,
  useMfaStatus,
  useRegenerateRecoveryCodes,
  useRevokeAllSessions,
  useRevokeOtherSessions,
  useRevokeSession,
  useSecurityActivity,
  useSessions,
} from '@/api/auth'
import { Button } from '@/components/ui/Button'
import { Card, CardBody } from '@/components/ui/Card'
import { Alert, Badge, ErrorState, Spinner } from '@/components/ui/Feedback'
import { TextField } from '@/components/ui/Field'
import { ConfirmDialog, Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/toast'
import { useAuth } from '@/features/auth/AuthContext'
import { deviceKind, eventOutcome, groupSecret, recoveryCodesText, timeAgo } from '@/features/auth/security'
import { actionLabel } from '@/features/workspace/format'
import type { MfaSetup, UserSessionInfo } from '@/types/api'
import { cn } from '@/utils/cn'
import { dayMonthYear, dayMonthYearTime } from '@/utils/dates'
import { applyApiErrors, errorMessage } from '@/utils/formErrors'

function SecurityTitle({ icon: Icon, title, badge, action }: { icon: LucideIcon; title: string; badge?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
      <h2 className="flex min-w-0 items-center gap-2.5 text-[18px] font-bold text-ink">
        <Icon className="size-6 shrink-0 text-brand-700" aria-hidden /> {title}
      </h2>
      {(badge || action) && <div className="flex flex-wrap items-center gap-2">{badge}{action}</div>}
    </div>
  )
}

// --- Recovery codes (shown exactly once) ---------------------------------------------------------
function RecoveryCodesPanel({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const { user } = useAuth()
  const toast = useToast()
  const [saved, setSaved] = useState(false)

  const download = () => {
    const blob = new Blob([recoveryCodesText(codes, user?.email ?? '')], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'myecatalogues-recovery-codes.txt'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      <Alert tone="warning" title="Save these codes now">
        They will not be shown again. Each code signs you in once if you lose your authenticator app. Keep them somewhere safe and private.
      </Alert>
      <ol className="grid grid-cols-1 gap-2 rounded-xl bg-[#f5f9ff] p-4 font-mono text-[15px] text-ink ring-1 ring-[#e3ecf8] min-[420px]:grid-cols-2" aria-label="Recovery codes">
        {codes.map((c) => <li key={c} className="text-center tracking-wider">{c}</li>)}
      </ol>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" icon={<Copy className="size-4" aria-hidden />}
          onClick={() => navigator.clipboard?.writeText(codes.join('\n')).then(() => toast.show('Recovery codes copied.'))}>
          Copy codes
        </Button>
        <Button variant="secondary" size="sm" icon={<Download className="size-4" aria-hidden />} onClick={download}>
          Download .txt
        </Button>
      </div>
      <label className="flex items-start gap-2 text-sm text-ink">
        <input type="checkbox" className="mt-0.5 size-4 accent-brand-700" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
        I have saved my recovery codes somewhere safe.
      </label>
      <div className="flex justify-end">
        <Button onClick={onDone} disabled={!saved}>Done</Button>
      </div>
    </div>
  )
}

// --- Enable (setup → scan + confirm → codes) -----------------------------------------------------
const passwordSchema = z.object({ password: z.string().min(1, 'Enter your password.') })
const codeSchema = z.object({ code: z.string().trim().regex(/^\d{3}\s?\d{3}$/, 'Enter the 6-digit code from your app.') })
const reauthSchema = z.object({
  password: z.string().min(1, 'Enter your password.'),
  code: z.string().trim().min(6, 'Enter an authenticator or recovery code.').max(32),
})

function PasswordStep({ onSetup }: { onSetup: (setup: MfaSetup) => void }) {
  const setup = useMfaSetup()
  const [formError, setFormError] = useState<string | null>(null)
  const { register, handleSubmit, setError, formState: { errors } } = useForm<z.infer<typeof passwordSchema>>({
    resolver: zodResolver(passwordSchema), defaultValues: { password: '' },
  })
  const onSubmit = handleSubmit(async ({ password }) => {
    setFormError(null)
    try {
      onSetup(await setup.mutateAsync(password))
    } catch (error) {
      setFormError(applyApiErrors(error, setError, ['password']))
    }
  })
  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <p className="text-sm text-body">Confirm your password to start. You'll need an authenticator app such as Google Authenticator, Microsoft Authenticator or 1Password.</p>
      {formError && <Alert tone="error">{formError}</Alert>}
      <TextField label="Current password" type="password" autoComplete="current-password" autoFocus error={errors.password?.message} {...register('password')} />
      <div className="flex justify-end"><Button type="submit" loading={setup.isPending}>Continue</Button></div>
    </form>
  )
}

function ScanStep({ setup, onConfirmed }: { setup: MfaSetup; onConfirmed: (codes: string[]) => void }) {
  const confirm = useMfaConfirm()
  const toast = useToast()
  const [formError, setFormError] = useState<string | null>(null)
  const { register, handleSubmit, setError, reset, formState: { errors } } = useForm<z.infer<typeof codeSchema>>({
    resolver: zodResolver(codeSchema), defaultValues: { code: '' },
  })
  const onSubmit = handleSubmit(async ({ code }) => {
    setFormError(null)
    try {
      onConfirmed((await confirm.mutateAsync(code)).recovery_codes)
    } catch (error) {
      reset({ code: '' })
      setFormError(applyApiErrors(error, setError, ['code']))
    }
  })
  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-[176px_minmax(0,1fr)] [&>*]:min-w-0">
        <img src={setup.qr_code} alt="QR code to add myEcatalogues to your authenticator app" width={176} height={176}
          className="mx-auto size-44 rounded-xl bg-white p-1 ring-1 ring-[#e3ecf8]" />
        <div className="space-y-2 text-sm text-body">
          <p><span className="font-semibold text-ink">1.</span> Scan this QR code with your authenticator app.</p>
          <p>Can't scan it? Enter this key manually (time-based, 6 digits):</p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded-lg bg-[#f5f9ff] px-2.5 py-1.5 font-mono text-[13px] text-ink ring-1 ring-[#e3ecf8] [overflow-wrap:anywhere]">{groupSecret(setup.secret)}</code>
            <Button variant="ghost" size="sm" icon={<Copy className="size-3.5" aria-hidden />}
              onClick={() => navigator.clipboard?.writeText(setup.secret).then(() => toast.show('Key copied.'))}>Copy</Button>
          </div>
          <p><span className="font-semibold text-ink">2.</span> Enter the 6-digit code the app shows.</p>
        </div>
      </div>
      {formError && <Alert tone="error">{formError}</Alert>}
      <TextField label="Authentication code" inputMode="numeric" autoComplete="one-time-code" placeholder="123 456" autoFocus
        className="tracking-[0.2em]" error={errors.code?.message} {...register('code')} />
      <div className="flex justify-end"><Button type="submit" loading={confirm.isPending}>Verify and enable</Button></div>
    </form>
  )
}

function EnableMfaModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [setup, setSetup] = useState<MfaSetup | null>(null)
  const [codes, setCodes] = useState<string[] | null>(null)
  const close = () => {
    setSetup(null)
    setCodes(null)
    onClose()
  }
  const title = codes ? 'Two-factor authentication is on' : setup ? 'Set up your authenticator app' : 'Enable two-factor authentication'
  return (
    <Modal open={open} onClose={close} title={title} size="lg">
      {codes ? <RecoveryCodesPanel codes={codes} onDone={close} />
        : setup ? <ScanStep setup={setup} onConfirmed={setCodes} />
        : <PasswordStep onSetup={setSetup} />}
    </Modal>
  )
}

// --- Disable / regenerate (password + second factor) ---------------------------------------------
function ReauthModal({ mode, open, onClose }: { mode: 'disable' | 'regenerate'; open: boolean; onClose: () => void }) {
  const disable = useMfaDisable()
  const regenerate = useRegenerateRecoveryCodes()
  const toast = useToast()
  const [codes, setCodes] = useState<string[] | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const { register, handleSubmit, setError, reset, formState: { errors } } = useForm<z.infer<typeof reauthSchema>>({
    resolver: zodResolver(reauthSchema), defaultValues: { password: '', code: '' },
  })
  const close = () => {
    reset()
    setCodes(null)
    setFormError(null)
    onClose()
  }
  const onSubmit = handleSubmit(async (values) => {
    setFormError(null)
    try {
      if (mode === 'disable') {
        await disable.mutateAsync(values)
        toast.show('Two-factor authentication disabled.')
        close()
      } else {
        setCodes((await regenerate.mutateAsync(values)).recovery_codes)
      }
    } catch (error) {
      reset({ ...values, code: '' })
      setFormError(applyApiErrors(error, setError, ['password', 'code']))
    }
  })
  const pending = disable.isPending || regenerate.isPending
  return (
    <Modal open={open} onClose={close} size={codes ? 'lg' : 'md'}
      title={codes ? 'Your new recovery codes' : mode === 'disable' ? 'Disable two-factor authentication' : 'Regenerate recovery codes'}>
      {codes ? <RecoveryCodesPanel codes={codes} onDone={close} /> : (
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <p className="text-sm text-body">
            {mode === 'disable'
              ? 'Your account will be protected by your password only. Confirm with your password and a current authenticator code (or a recovery code).'
              : 'Your current recovery codes will stop working immediately. Confirm with your password and a current authenticator code (or a recovery code).'}
          </p>
          {formError && <Alert tone="error">{formError}</Alert>}
          <TextField label="Current password" type="password" autoComplete="current-password" autoFocus error={errors.password?.message} {...register('password')} />
          <TextField label="Authenticator or recovery code" autoComplete="one-time-code" autoCapitalize="none" spellCheck={false}
            error={errors.code?.message} {...register('code')} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={close} disabled={pending}>Cancel</Button>
            <Button type="submit" variant={mode === 'disable' ? 'danger' : 'primary'} loading={pending}>
              {mode === 'disable' ? 'Disable 2FA' : 'Generate new codes'}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  )
}

export function TwoFactorCard() {
  const status = useMfaStatus()
  const [modal, setModal] = useState<'enable' | 'disable' | 'regenerate' | null>(null)
  const s = status.data
  return (
    <Card>
      <CardBody className="pt-5">
        <SecurityTitle icon={ShieldCheck} title="Two-Factor Authentication (2FA)"
          badge={s && (s.enabled
            ? <Badge tone="success"><CircleCheck className="mr-1 size-3.5" aria-hidden />Enabled</Badge>
            : <Badge tone="neutral">Off</Badge>)} />
        <p className="mb-4 text-[13.5px] text-body">Add an extra layer of security: after your password, sign-in also asks for a code from an authenticator app.</p>
        {status.isPending ? <Spinner className="py-6" /> : status.isError ? <ErrorState error={status.error} onRetry={() => void status.refetch()} /> : s && (
          <div className="space-y-4">
            <div className="flex gap-3 rounded-xl bg-[#f5f9ff] p-4 ring-1 ring-[#e3ecf8]">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white text-brand-700 ring-1 ring-[#e3ecf8]"><Smartphone className="size-6" aria-hidden /></span>
              <div className="min-w-0 text-[13.5px]">
                <p className="font-semibold text-ink">Authenticator App</p>
                {s.enabled ? (
                  <p className="text-body">
                    On since {s.enabled_at ? dayMonthYear(new Date(s.enabled_at)) : '—'} · {s.recovery_codes_remaining} of {s.recovery_codes_total} recovery codes left
                  </p>
                ) : (
                  <p className="text-body">Use Google Authenticator, Microsoft Authenticator or any TOTP app to get verification codes.</p>
                )}
              </div>
            </div>
            {s.enabled && s.recovery_codes_remaining <= 2 && (
              <Alert tone="warning">You're running out of recovery codes. Generate a new set.</Alert>
            )}
            <div className="flex flex-wrap gap-2">
              {s.enabled ? (
                <>
                  <Button variant="secondary" icon={<KeyRound className="size-4" aria-hidden />} onClick={() => setModal('regenerate')}>New Recovery Codes</Button>
                  <Button variant="secondary" className="border-red-300 text-red-600 hover:bg-red-50" icon={<ShieldOff className="size-4" aria-hidden />} onClick={() => setModal('disable')}>Disable 2FA</Button>
                </>
              ) : (
                <Button icon={<ShieldCheck className="size-4" aria-hidden />} onClick={() => setModal('enable')}>Enable 2FA</Button>
              )}
            </div>
          </div>
        )}
      </CardBody>
      <EnableMfaModal open={modal === 'enable'} onClose={() => setModal(null)} />
      <ReauthModal mode="disable" open={modal === 'disable'} onClose={() => setModal(null)} />
      <ReauthModal mode="regenerate" open={modal === 'regenerate'} onClose={() => setModal(null)} />
    </Card>
  )
}

// --- Sessions ------------------------------------------------------------------------------------
const DEVICE_ICONS: Record<ReturnType<typeof deviceKind>, LucideIcon> = {
  windows: Monitor, apple: Laptop, phone: Smartphone, desktop: MonitorSmartphone,
}

function SessionRow({ s, onRevoke }: { s: UserSessionInfo; onRevoke: () => void }) {
  const Icon = DEVICE_ICONS[deviceKind(s.device_label)]
  const active = s.is_current ? 'Active now' : timeAgo(s.last_used_at) ?? dayMonthYear(new Date(s.last_used_at))
  return (
    <li className="flex items-center gap-3 py-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#eef4fd] text-brand-700"><Icon className="size-5" aria-hidden /></span>
      <div className="min-w-0 flex-1 text-[13.5px]">
        <p className="font-semibold text-ink [overflow-wrap:anywhere]">
          {s.device_label || 'Unknown device'}{s.is_current && <span className="font-medium text-emerald-600"> (This device)</span>}
        </p>
        <p className="text-body">Signed in {dayMonthYearTime(new Date(s.created_at))}{s.mfa_verified && ' · 2FA verified'}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1 text-right text-[12.5px] text-body">
        {s.is_current ? <Badge tone="success">Current</Badge> : (
          <button type="button" onClick={onRevoke} aria-label={`Sign out ${s.device_label || 'this device'}`}
            className="inline-flex size-8 items-center justify-center rounded-lg bg-red-50 text-red-600 hover:bg-red-100">
            <Trash2 className="size-4" aria-hidden />
          </button>
        )}
        <span>{active}</span>
      </div>
    </li>
  )
}

export function SessionsCard() {
  const sessions = useSessions()
  const revoke = useRevokeSession()
  const revokeOthers = useRevokeOtherSessions()
  const toast = useToast()
  const [target, setTarget] = useState<UserSessionInfo | null>(null)
  const [confirmOthers, setConfirmOthers] = useState(false)
  const rows = sessions.data ?? []
  const others = rows.filter((s) => !s.is_current).length

  return (
    <Card>
      <CardBody className="pt-5">
        <SecurityTitle icon={Monitor} title="Active Sessions"
          action={others > 0 && (
            <Button size="sm" variant="secondary" className="border-red-300 text-red-600 hover:bg-red-50" icon={<LogOut className="size-4" aria-hidden />}
              onClick={() => setConfirmOthers(true)}>Sign out other devices</Button>
          )} />
        <p className="text-[13.5px] text-body">Devices currently signed in to your account. Signing a device out takes effect on its next request.</p>
        {sessions.isPending ? <Spinner className="py-6" /> : sessions.isError ? (
          <div className="mt-3"><ErrorState error={sessions.error} onRetry={() => void sessions.refetch()} /></div>
        ) : (
          <>
            <ul className="divide-y divide-[#edf2fa]">
              {rows.map((s) => <SessionRow key={s.id} s={s} onRevoke={() => { revoke.reset(); setTarget(s) }} />)}
            </ul>
            {others === 0 && <p className="rounded-xl bg-[#f5f9ff] px-4 py-3 text-[13px] text-body">No other devices are signed in.</p>}
            {rows.length > 0 && !rows.some((s) => s.is_current) && (
              <p className="mt-2 text-xs text-muted">This device's session started before session tracking; it will appear after its next token refresh.</p>
            )}
          </>
        )}
      </CardBody>
      <ConfirmDialog
        open={target !== null}
        onClose={() => setTarget(null)}
        title="Sign out this device?"
        description={`${target?.device_label || 'The device'} will be signed out and must sign in again.`}
        confirmLabel="Sign out device"
        loading={revoke.isPending}
        error={revoke.isError ? errorMessage(revoke.error) : null}
        onConfirm={() => target && revoke.mutate(target.id, {
          onSuccess: () => { setTarget(null); toast.show('Device signed out.') },
        })}
      />
      <ConfirmDialog
        open={confirmOthers}
        onClose={() => setConfirmOthers(false)}
        title="Sign out all other devices?"
        description="Every device except this one will be signed out and must sign in again."
        confirmLabel="Sign out others"
        loading={revokeOthers.isPending}
        error={revokeOthers.isError ? errorMessage(revokeOthers.error) : null}
        onConfirm={() => revokeOthers.mutate(undefined, {
          onSuccess: (r) => { setConfirmOthers(false); toast.show(`${r.revoked} device${r.revoked === 1 ? '' : 's'} signed out.`) },
        })}
      />
    </Card>
  )
}

// --- Recent security activity --------------------------------------------------------------------
export function SecurityActivityCard({ action }: { action?: ReactNode }) {
  const activity = useSecurityActivity()
  const rows = activity.data ?? []
  return (
    <Card>
      <CardBody className="pt-5">
        <SecurityTitle icon={ShieldCheck} title="Recent Security Activity" action={action} />
        {activity.isPending ? <Spinner className="py-6" /> : activity.isError ? (
          <ErrorState error={activity.error} onRetry={() => void activity.refetch()} />
        ) : rows.length === 0 ? (
          <p className="rounded-xl bg-[#f5f9ff] px-4 py-3 text-[13px] text-body">No security events yet.</p>
        ) : (
          <div className="text-[13px]">
            <div className="hidden grid-cols-[28px_minmax(150px,1.1fr)_minmax(0,1.5fr)_minmax(0,1fr)_84px] gap-3 border-b border-[#edf2fa] pb-2 font-semibold text-ink md:grid">
              <span>#</span><span>Date &amp; Time</span><span>Activity</span><span>Device</span><span>Status</span>
            </div>
            <ol>
              {rows.slice(0, 8).map((e, i) => {
                const failed = eventOutcome(e.action) === 'failed'
                return (
                  <li key={e.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 border-b border-[#f1f5fb] py-2.5 last:border-0 md:grid-cols-[28px_minmax(150px,1.1fr)_minmax(0,1.5fr)_minmax(0,1fr)_84px] md:items-center">
                    <span className="hidden text-body md:block">{i + 1}</span>
                    <span className="order-2 text-body md:order-none">{dayMonthYearTime(new Date(e.created_at))}</span>
                    <span className={cn('order-1 flex min-w-0 items-center gap-1.5 font-medium md:order-none', failed ? 'text-red-600' : 'text-ink')}>
                      {failed ? <CircleAlert className="size-4 shrink-0" aria-hidden /> : <CircleCheck className="size-4 shrink-0 text-emerald-600" aria-hidden />}
                      <span className="[overflow-wrap:anywhere]">{actionLabel(e.action)}</span>
                    </span>
                    <span className="order-4 text-body [overflow-wrap:anywhere] md:order-none">{e.device || '—'}</span>
                    <span className="order-3 row-span-1 justify-self-end md:order-none md:justify-self-start">
                      <Badge tone={failed ? 'danger' : 'success'}>{failed ? 'Failed' : 'Success'}</Badge>
                    </span>
                  </li>
                )
              })}
            </ol>
          </div>
        )}
      </CardBody>
    </Card>
  )
}

// --- Danger zone ---------------------------------------------------------------------------------
export function DangerZoneCard() {
  const status = useMfaStatus()
  const revokeAll = useRevokeAllSessions()
  const { logout } = useAuth()
  const navigate = useNavigate()
  const [confirmAll, setConfirmAll] = useState(false)
  const [regenerate, setRegenerate] = useState(false)
  const mfaOn = status.data?.enabled ?? false

  return (
    <Card>
      <CardBody className="pt-5">
        <SecurityTitle icon={TriangleAlert} title="Danger Zone" />
        <ul className="space-y-3">
          <li className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-red-50/60 p-3 ring-1 ring-red-100">
            <div className="min-w-0 flex-1 text-[13px]">
              <p className="flex items-center gap-1.5 font-semibold text-ink"><LogOut className="size-4 text-red-600" aria-hidden /> Sign Out from All Devices</p>
              <p className="text-body">Signs your account out of every session, including this one.</p>
            </div>
            <Button size="sm" variant="secondary" className="border-red-300 text-red-600 hover:bg-red-50" onClick={() => { revokeAll.reset(); setConfirmAll(true) }}>Sign Out All</Button>
          </li>
          <li className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-amber-50/60 p-3 ring-1 ring-amber-100">
            <div className="min-w-0 flex-1 text-[13px]">
              <p className="flex items-center gap-1.5 font-semibold text-ink"><RefreshCw className="size-4 text-amber-600" aria-hidden /> Regenerate Backup Codes</p>
              <p className="text-body">{mfaOn ? 'Generate new recovery codes for 2FA. Old codes will no longer work.' : 'Available once two-factor authentication is enabled.'}</p>
            </div>
            <Button size="sm" variant="secondary" className="border-amber-300 text-amber-700 hover:bg-amber-50" disabled={!mfaOn} onClick={() => setRegenerate(true)}>Generate New</Button>
          </li>
        </ul>
      </CardBody>
      <ConfirmDialog
        open={confirmAll}
        onClose={() => setConfirmAll(false)}
        title="Sign out everywhere?"
        description="Every device — including this one — will be signed out. You'll need to sign in again."
        confirmLabel="Sign out everywhere"
        loading={revokeAll.isPending}
        error={revokeAll.isError ? errorMessage(revokeAll.error) : null}
        onConfirm={() => revokeAll.mutate(undefined, {
          onSuccess: async () => {
            setConfirmAll(false)
            await logout()
            navigate('/login', { replace: true })
          },
        })}
      />
      <ReauthModal mode="regenerate" open={regenerate} onClose={() => setRegenerate(false)} />
    </Card>
  )
}
