import { CircleAlert, CircleCheck, Info, LoaderCircle, TriangleAlert, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/utils/cn'

type Tone = 'info' | 'success' | 'warning' | 'error'

const alertTones: Record<Tone, { box: string; icon: LucideIcon }> = {
  info: { box: 'border-brand-200 bg-brand-50 text-brand-900', icon: Info },
  success: { box: 'border-emerald-200 bg-emerald-50 text-emerald-900', icon: CircleCheck },
  warning: { box: 'border-amber-200 bg-amber-50 text-amber-900', icon: TriangleAlert },
  error: { box: 'border-red-200 bg-red-50 text-red-800', icon: CircleAlert },
}

export function Alert({
  tone = 'info',
  title,
  children,
  action,
  className,
}: {
  tone?: Tone
  title?: string
  children?: ReactNode
  action?: ReactNode
  className?: string
}) {
  const { box, icon: Icon } = alertTones[tone]
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn('flex gap-3 rounded-lg border px-4 py-3 text-sm', box, className)}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn(title && 'mt-0.5')}>{children}</div>}
      </div>
      {action && <div className="shrink-0 self-center">{action}</div>}
    </div>
  )
}

// Pastel status chips from the reference (no outline): Active green, Pending amber, Inactive red, Plan blue.
const badgeTones = {
  neutral: 'bg-[#eceff5] text-[#55607f]',
  brand: 'bg-[#e0ebff] text-[#1f5fe0]',
  success: 'bg-[#dcf7e5] text-[#14a04a]',
  warning: 'bg-[#fff1d6] text-[#d97706]',
  danger: 'bg-[#ffe1e8] text-[#e11d48]',
}

export function Badge({ tone = 'neutral', children }: { tone?: keyof typeof badgeTones; children: ReactNode }) {
  return (
    <span className={cn('inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium', badgeTones[tone])}>
      {children}
    </span>
  )
}

export function Spinner({ label = 'Loading…', className }: { label?: string; className?: string }) {
  return (
    <div role="status" className={cn('flex items-center justify-center gap-2 py-10 text-sm text-muted', className)}>
      <LoaderCircle className="size-5 animate-spin text-brand-600" aria-hidden />
      {label}
    </div>
  )
}

export function FullPageSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Spinner />
    </div>
  )
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center rounded-2xl bg-white px-6 py-12 text-center shadow-panel">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-[#d5e9fd] text-[#085afc]">
        <Icon className="size-7" fill="currentColor" fillOpacity={0.16} aria-hidden />
      </span>
      <h3 className="mt-4 text-base font-semibold text-ink">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-body">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof Error ? error.message : 'Something went wrong.'
  return (
    <Alert
      tone="error"
      title="Couldn't load this data"
      action={
        onRetry && (
          <button type="button" onClick={onRetry} className="text-sm font-medium underline underline-offset-2">
            Retry
          </button>
        )
      }
    >
      {message}
    </Alert>
  )
}
