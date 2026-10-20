import { CircleAlert, CircleCheck, DatabaseBackup, RefreshCw, Settings } from 'lucide-react'
import { useSystemStatus } from '@/api/platform'
import { PageHero } from '@/components/panel/PageHero'
import { Button } from '@/components/ui/Button'
import { Alert, ErrorState, Spinner } from '@/components/ui/Feedback'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { formatDateTime } from '@/features/leads/leadFormat'
import { RequirePlatformPermission } from '@/routes/guards'

function show(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'object') return Object.entries(value as Record<string, unknown>).map(([k, v]) => `${k}: ${v}`).join(' · ')
  return String(value)
}

const LABELS: Record<string, string> = {
  debug: 'Debug mode', time_zone: 'Server time zone', frontend_url: 'Public site URL', billing_currency: 'Billing currency',
  subscription_grace_days: 'Grace period (days)', subscription_reminder_days: 'Expiry reminder (days)',
  media_max_upload_mb: 'Max upload (MB)', throttle_rates: 'Rate limits', python: 'Python', django: 'Django',
}

/** Read-only: configuration lives in environment variables and is never editable or shown with secrets. */
export function AdminSystemPage() {
  const status = useSystemStatus()
  const d = status.data
  return (
    <RequirePlatformPermission code="platform.system.view">
      <PageHero icon={Settings} title="System Settings" description="Health checks and the current, non-secret configuration of this deployment."
        action={<Button variant="secondary" icon={<RefreshCw className="size-4" />} loading={status.isFetching} onClick={() => status.refetch()}>Re-check</Button>} />
      {status.isPending ? <Spinner /> : status.isError ? <ErrorState error={status.error} onRetry={() => status.refetch()} /> : d && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader title="Health checks" description={`Checked ${formatDateTime(d.checked_at)}`} />
            <CardBody className="p-0">
              <ul className="divide-y divide-border">
                {d.checks.map((c) => (
                  <li key={c.key} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                    <span className="flex items-center gap-2 font-medium">
                      {c.ok ? <CircleCheck className="size-4 text-emerald-600" aria-hidden /> : <CircleAlert className="size-4 text-amber-600" aria-hidden />}
                      {c.label}
                    </span>
                    <span className="text-right text-xs text-muted">{c.detail}</span>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Configuration" description="Set through environment variables (see SETUP.md). Secrets are never displayed." />
            <CardBody className="p-0">
              <dl className="divide-y divide-border text-sm">
                {Object.entries(d.config).map(([k, v]) => (
                  <div key={k} className="grid grid-cols-[11rem_minmax(0,1fr)] gap-3 px-5 py-2.5">
                    <dt className="text-muted">{LABELS[k] ?? k}</dt><dd className="break-words">{show(v)}</dd>
                  </div>
                ))}
              </dl>
            </CardBody>
          </Card>
          <Alert tone="info" title="Backup & recovery" className="lg:col-span-2">
            <span className="inline-flex items-start gap-2"><DatabaseBackup className="mt-0.5 size-4 shrink-0" aria-hidden />
              Backups are an infrastructure task and there is deliberately no restore button here — a restore overwrites live data. Use the
              documented <code>pg_dump</code> / <code>pg_restore</code> procedure in SETUP.md (“Backup & recovery”), and back up the media storage too.</span>
          </Alert>
        </div>
      )}
    </RequirePlatformPermission>
  )
}
