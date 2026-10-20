import { Lock, Mail, RotateCcw, Save, Send } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { previewEmailTemplate, useEmailTemplates, useResetEmailTemplate, useSaveEmailTemplate, useSendTestEmail } from '@/api/settings'
import { ApiError } from '@/api/client'
import { PageHero } from '@/components/panel/PageHero'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Alert, Badge, EmptyState, ErrorState, Spinner } from '@/components/ui/Feedback'
import { ConfirmDialog } from '@/components/ui/Modal'
import { Switch } from '@/components/ui/Switch'
import { useToast } from '@/components/ui/toast'
import { useAuth } from '@/features/auth/AuthContext'
import { formatDateTime } from '@/features/leads/leadFormat'
import { RequirePlatformPermission } from '@/routes/guards'
import type { EmailPreview, EmailTemplate } from '@/types/settings'
import { cn } from '@/utils/cn'

function Editor({ template }: { template: EmailTemplate }) {
  const { user } = useAuth()
  const toast = useToast()
  const save = useSaveEmailTemplate()
  const reset = useResetEmailTemplate()
  const test = useSendTestEmail()
  const [subject, setSubject] = useState(template.subject)
  const [body, setBody] = useState(template.body)
  const [active, setActive] = useState(template.is_custom ? template.is_active : true)
  const [preview, setPreview] = useState<EmailPreview | null>(null)
  const [serverErrors, setServerErrors] = useState<Record<string, string[]>>({})
  const [confirmReset, setConfirmReset] = useState(false)
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const dirty = subject !== template.subject || body !== template.body || active !== (template.is_custom ? template.is_active : true)

  useEffect(() => {
    setSubject(template.subject)
    setBody(template.body)
    setActive(template.is_custom ? template.is_active : true)
    setServerErrors({})
  }, [template])

  // Live preview, rendered by the server with sample data (debounced).
  useEffect(() => {
    const t = setTimeout(() => {
      previewEmailTemplate(template.key, { subject, body }).then(setPreview).catch(() => setPreview(null))
    }, 400)
    return () => clearTimeout(t)
  }, [template.key, subject, body])

  const insert = (name: string) => {
    const el = bodyRef.current
    const token = `{{ ${name} }}`
    if (!el) return setBody((b) => b + token)
    const start = el.selectionStart ?? body.length
    const next = body.slice(0, start) + token + body.slice(el.selectionEnd ?? start)
    setBody(next)
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(start + token.length, start + token.length) })
  }

  const errorsOf = (e: unknown) => (e instanceof ApiError && e.details ? (e.details as Record<string, string[]>) : {})
  const errors = Object.keys(serverErrors).length ? serverErrors : preview?.errors ?? {}

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Card>
        <CardHeader title={template.name} description={template.description}
          action={template.mandatory ? <Badge tone="neutral"><Lock className="mr-1 size-3" /> Always sent</Badge> : undefined} />
        <CardBody className="space-y-4">
          <p className="text-xs text-muted">
            {template.is_custom
              ? `Customised${template.updated_by_name ? ` by ${template.updated_by_name}` : ''} · ${formatDateTime(template.updated_at)}`
              : 'Using the built-in default.'}
          </p>
          <label className="block text-sm font-medium">Subject
            <input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200}
              aria-invalid={Boolean(errors.subject)} className="mt-1.5 block h-10 w-full rounded-lg border border-border px-3 text-sm focus:border-brand-600 focus:outline-none" />
            {errors.subject && <span className="text-xs text-red-600">{errors.subject.join(' ')}</span>}
          </label>
          <label className="block text-sm font-medium">Email text (plain text)
            <textarea ref={bodyRef} value={body} onChange={(e) => setBody(e.target.value)} rows={14} maxLength={10000}
              aria-invalid={Boolean(errors.body)} className="mt-1.5 block w-full rounded-lg border border-border px-3 py-2 font-mono text-[13px] leading-relaxed focus:border-brand-600 focus:outline-none" />
            {errors.body && <span className="text-xs text-red-600">{errors.body.join(' ')}</span>}
          </label>
          <div>
            <p className="mb-1.5 text-sm font-medium">Variables <span className="font-normal text-muted">(click to insert)</span></p>
            <ul className="flex flex-wrap gap-1.5">
              {template.variables.map((v) => (
                <li key={v.name}>
                  <button type="button" onClick={() => insert(v.name)} title={`${v.description} — e.g. ${v.sample}`}
                    className={cn('rounded-md px-2 py-1 font-mono text-xs ring-1', v.required ? 'bg-brand-50 text-brand-800 ring-brand-200' : 'bg-canvas text-slate-700 ring-border')}>
                    {`{{ ${v.name} }}`}{v.required && ' *'}
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-1.5 text-xs text-muted">* required. Only these placeholders work — no other template code is accepted. A line whose placeholders are all empty is left out.</p>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-lg bg-canvas px-3 py-2">
            <span className="text-sm">Use this version <span className="text-xs text-muted">(off = send the built-in default)</span></span>
            <Switch label="Use the customised version" checked={active} onChange={setActive} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button icon={<Save className="size-4" />} disabled={!dirty} loading={save.isPending}
              onClick={() => {
                setServerErrors({})
                save.mutate({ key: template.key, subject, body, is_active: active }, {
                  onSuccess: () => toast.show('Template saved.'),
                  onError: (e) => { setServerErrors(errorsOf(e)); toast.show(e.message, 'error') },
                })
              }}>
              Save
            </Button>
            <Button variant="secondary" icon={<Send className="size-4" />} loading={test.isPending}
              onClick={() => test.mutate({ key: template.key, subject, body }, {
                onSuccess: (r) => toast.show(`Test email sent to ${r.sent_to}.`),
                onError: (e) => { setServerErrors(errorsOf(e)); toast.show(e.message, 'error') },
              })}>
              Send test to {user?.email}
            </Button>
            {template.is_custom && (
              <Button variant="ghost" icon={<RotateCcw className="size-4" />} onClick={() => setConfirmReset(true)}>Reset to default</Button>
            )}
          </div>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Preview" description="Rendered with sample data. Nothing is sent." />
        <CardBody>
          {!preview ? <Spinner /> : (
            <div className="rounded-xl border border-border">
              <div className="border-b border-border bg-canvas px-4 py-2.5 text-sm">
                <span className="text-muted">Subject: </span><span className="font-semibold">{preview.subject || '—'}</span>
              </div>
              <pre className="px-4 py-3 font-sans text-sm leading-relaxed whitespace-pre-wrap break-words text-slate-800">{preview.body}</pre>
            </div>
          )}
          {Object.keys(preview?.errors ?? {}).length > 0 && (
            <Alert tone="error" className="mt-3" title="This draft can't be saved yet">
              {Object.values(preview!.errors).flat().join(' ')}
            </Alert>
          )}
        </CardBody>
      </Card>
      <ConfirmDialog open={confirmReset} onClose={() => setConfirmReset(false)} loading={reset.isPending} confirmLabel="Reset"
        title="Reset to the built-in default?" description="Your customised subject and text are deleted. The default is used immediately."
        onConfirm={() => reset.mutate(template.key, { onSuccess: () => { setConfirmReset(false); toast.show('Template reset to default.') } })} />
    </div>
  )
}

export function AdminEmailTemplatesPage() {
  const templates = useEmailTemplates()
  const [selected, setSelected] = useState<string | null>(null)
  const list = templates.data ?? []
  const current = list.find((t) => t.key === selected) ?? list[0]
  const groups = [...new Set(list.map((t) => t.group))]

  return (
    <RequirePlatformPermission code="platform.email_template.manage">
      <PageHero icon={Mail} title="Email Templates" description="Edit the wording of emails myEcatalogues sends. Only listed placeholders are allowed; links and security emails always keep their required parts." />
      {templates.isPending ? <Spinner /> : templates.isError ? <ErrorState error={templates.error} onRetry={() => templates.refetch()} /> : !current ? (
        <EmptyState icon={Mail} title="No templates" />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
          <nav aria-label="Email templates" className="space-y-4">
            {groups.map((g) => (
              <div key={g}>
                <p className="mb-1 px-2 text-xs font-semibold tracking-wide text-muted uppercase">{g}</p>
                <ul className="space-y-0.5">
                  {list.filter((t) => t.group === g).map((t) => (
                    <li key={t.key}>
                      <button type="button" onClick={() => setSelected(t.key)} aria-current={current.key === t.key}
                        className={cn('flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm',
                          current.key === t.key ? 'bg-brand-50 font-medium text-brand-800' : 'text-slate-700 hover:bg-canvas')}>
                        {t.name}
                        {t.is_custom && <span className={cn('size-2 shrink-0 rounded-full', t.is_active ? 'bg-emerald-500' : 'bg-slate-300')} title={t.is_active ? 'Customised (in use)' : 'Customised (not in use)'} />}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
          <Editor template={current} />
        </div>
      )}
    </RequirePlatformPermission>
  )
}
