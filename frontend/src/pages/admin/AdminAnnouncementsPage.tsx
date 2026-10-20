import { zodResolver } from '@hookform/resolvers/zod'
import { Archive, EyeOff, Megaphone, Pencil, Plus, Send, Users, X } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { useAdminAnnouncements, useAnnouncementAction, useAudienceCount, useBusinessOptions, useSaveAnnouncement } from '@/api/settings'
import { ActionMenu } from '@/components/panel/ActionMenu'
import { PageHero } from '@/components/panel/PageHero'
import { FilterSelect, SearchInput, Toolbar } from '@/components/panel/Toolbar'
import { Button } from '@/components/ui/Button'
import { EmptyState, ErrorState, Spinner } from '@/components/ui/Feedback'
import { Checkbox, SelectField, TextAreaField, TextField } from '@/components/ui/Field'
import { ConfirmDialog, Modal } from '@/components/ui/Modal'
import { Pagination } from '@/components/ui/Pagination'
import { useToast } from '@/components/ui/toast'
import { formatDateTime } from '@/features/leads/leadFormat'
import { browserTimeZone, fromLocalInput, toLocalInput } from '@/features/settings/datetime'
import { RequirePlatformPermission } from '@/routes/guards'
import type { Announcement, AnnouncementAudience, AnnouncementStatus, BusinessOption } from '@/types/settings'
import { applyApiErrors } from '@/utils/formErrors'
import { cn } from '@/utils/cn'

const AUDIENCES: { value: AnnouncementAudience; label: string }[] = [
  { value: 'all_businesses', label: 'All members of all businesses' },
  { value: 'business_owners', label: 'Business owners only' },
  { value: 'selected_businesses', label: 'Members of selected businesses' },
  { value: 'platform_staff', label: 'Platform staff (Super & Support Admins)' },
]
const AUDIENCE_LABEL = Object.fromEntries(AUDIENCES.map((a) => [a.value, a.label])) as Record<AnnouncementAudience, string>

const STATUS: Record<AnnouncementStatus, string> = {
  draft: 'bg-slate-100 text-slate-700',
  scheduled: 'bg-amber-50 text-amber-800',
  published: 'bg-emerald-50 text-emerald-700',
  unpublished: 'bg-red-50 text-red-700',
  archived: 'bg-slate-100 text-slate-500',
}

const schema = z.object({
  title: z.string().trim().min(3, 'Use at least 3 characters.').max(150),
  body: z.string().trim().min(1, 'Write the announcement.').max(4000),
  level: z.enum(['info', 'success', 'warning', 'error']),
  audience: z.enum(['all_businesses', 'business_owners', 'selected_businesses', 'platform_staff']),
  send_email: z.boolean(),
  starts_at: z.string(),
  ends_at: z.string(),
}).refine((v) => !v.starts_at || !v.ends_at || new Date(v.ends_at) > new Date(v.starts_at), {
  message: 'End time must be after the start time.', path: ['ends_at'],
})
type Values = z.infer<typeof schema>

function BusinessPicker({ value, onChange }: { value: BusinessOption[]; onChange: (v: BusinessOption[]) => void }) {
  const [search, setSearch] = useState('')
  const options = useBusinessOptions(search)
  const chosen = new Set(value.map((b) => b.id))
  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <p className="text-sm font-medium">Businesses</p>
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {value.map((b) => (
            <li key={b.id} className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-800">
              {b.name}
              <button type="button" aria-label={`Remove ${b.name}`} onClick={() => onChange(value.filter((x) => x.id !== b.id))}><X className="size-3" /></button>
            </li>
          ))}
        </ul>
      )}
      <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search businesses by name…" aria-label="Search businesses"
        className="h-9 w-full rounded-lg border border-border px-3 text-sm" />
      <ul className="max-h-40 overflow-y-auto text-sm">
        {(options.data ?? []).filter((b) => !chosen.has(b.id)).map((b) => (
          <li key={b.id}>
            <button type="button" onClick={() => onChange([...value, b])} className="w-full rounded px-2 py-1.5 text-left hover:bg-canvas">
              {b.name} <span className="text-xs text-muted">/{b.slug}</span>
            </button>
          </li>
        ))}
        {options.data?.length === 0 && <li className="px-2 py-1.5 text-muted">No businesses found.</li>}
      </ul>
    </div>
  )
}

function Editor({ announcement, onClose }: { announcement: Announcement | null; onClose: () => void }) {
  const save = useSaveAnnouncement()
  const toast = useToast()
  const delivered = Boolean(announcement?.delivered_at)
  const [businesses, setBusinesses] = useState<BusinessOption[]>(announcement?.businesses ?? [])
  const [formError, setFormError] = useState<string | null>(null)
  const { register, handleSubmit, watch, setError, formState: { errors } } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: announcement?.title ?? '', body: announcement?.body ?? '', level: announcement?.level ?? 'info',
      audience: announcement?.audience ?? 'all_businesses', send_email: announcement?.send_email ?? false,
      starts_at: toLocalInput(announcement?.starts_at), ends_at: toLocalInput(announcement?.ends_at),
    },
  })
  const audience = watch('audience')
  const count = useAudienceCount(audience, businesses.map((b) => b.id), !delivered)
  const preview = { title: watch('title'), body: watch('body') }

  const submit = handleSubmit((v) => {
    setFormError(null)
    if (v.audience === 'selected_businesses' && businesses.length === 0) {
      setFormError('Choose at least one business.')
      return
    }
    const payload = {
      id: announcement?.id, title: v.title, body: v.body, level: v.level,
      starts_at: fromLocalInput(v.starts_at), ends_at: fromLocalInput(v.ends_at),
      // Audience can't change after delivery — don't send it then.
      ...(delivered ? {} : { audience: v.audience, send_email: v.send_email, business_ids: v.audience === 'selected_businesses' ? businesses.map((b) => b.id) : [] }),
    }
    save.mutate(payload, {
      onSuccess: () => { toast.show(announcement ? 'Announcement saved.' : 'Draft created.'); onClose() },
      onError: (e) => setFormError(applyApiErrors(e, setError, ['title', 'body', 'level', 'audience', 'starts_at', 'ends_at'], { business_ids: 'audience' })),
    })
  })

  return (
    <Modal open onClose={onClose} size="lg" title={announcement ? 'Edit announcement' : 'New announcement'}
      description="Saved as a draft. Nobody sees it until you publish."
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="announcement-form" loading={save.isPending}>Save draft</Button></>}>
      <form id="announcement-form" noValidate onSubmit={submit} className="space-y-4">
        {formError && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>}
        <TextField label="Title" error={errors.title?.message} {...register('title')} />
        <TextAreaField label="Message" rows={4} maxLength={4000} error={errors.body?.message} {...register('body')} />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField label="Style" {...register('level')}>
            <option value="info">Info</option><option value="success">Success</option><option value="warning">Warning</option><option value="error">Important</option>
          </SelectField>
          <SelectField label="Audience" disabled={delivered} error={errors.audience?.message} {...register('audience')}>
            {AUDIENCES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
          </SelectField>
        </div>
        {audience === 'selected_businesses' && !delivered && <BusinessPicker value={businesses} onChange={setBusinesses} />}
        <p className="flex items-center gap-2 text-sm text-muted">
          <Users className="size-4" aria-hidden />
          {delivered ? `Delivered to ${announcement?.recipient_count} people — the audience is fixed.` : count.isPending ? 'Counting recipients…' : `Will reach ${count.data?.recipients ?? 0} people right now.`}
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label={`Start (optional, ${browserTimeZone()})`} type="datetime-local" error={errors.starts_at?.message} {...register('starts_at')} />
          <TextField label={`End (optional, ${browserTimeZone()})`} type="datetime-local" error={errors.ends_at?.message} {...register('ends_at')} />
        </div>
        <Checkbox label="Also email people who opted in to announcement emails" disabled={delivered} {...register('send_email')} />
        <div>
          <p className="mb-1.5 text-sm font-medium">Preview</p>
          <div className="flex gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-brand-900">
            <Megaphone className="mt-0.5 size-5 shrink-0" aria-hidden />
            <div><p className="font-semibold">{preview.title || 'Title'}</p><p className="text-sm whitespace-pre-line">{preview.body || 'Your message'}</p></div>
          </div>
        </div>
      </form>
    </Modal>
  )
}

export function AdminAnnouncementsPage() {
  const toast = useToast()
  const [params, setParams] = useState({ page: 1, search: '', status: '', audience: '' })
  const list = useAdminAnnouncements({ ...params, page_size: 10 })
  const act = useAnnouncementAction()
  const [editing, setEditing] = useState<Announcement | null | 'new'>(null)
  const [publishing, setPublishing] = useState<Announcement | null>(null)
  const publishCount = useAudienceCount(publishing?.audience ?? 'all_businesses', publishing?.businesses.map((b) => b.id) ?? [], Boolean(publishing))
  const set = (patch: Partial<typeof params>) => setParams((p) => ({ ...p, page: 1, ...patch }))
  const rows = list.data?.results ?? []
  const run = (a: Announcement, action: 'publish' | 'unpublish' | 'archive') =>
    act.mutate({ id: a.id, action }, {
      onSuccess: (r) => { toast.show(r.status === 'scheduled' ? 'Scheduled.' : `Announcement ${r.status}.`); setPublishing(null) },
      onError: (e) => toast.show(e.message, 'error'),
    })

  return (
    <RequirePlatformPermission code="platform.announcement.manage">
      <PageHero icon={Megaphone} title="Announcements" description="Tell businesses or staff about news and service notices. Published announcements appear as a banner and an in-app notification."
        action={<Button icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>New Announcement</Button>} />
      <Toolbar>
        <SearchInput value={params.search} onChange={(search) => set({ search })} placeholder="Search announcements…" />
        <FilterSelect label="Status" value={params.status} onChange={(status) => set({ status })}
          options={[{ value: '', label: 'All status' }, ...Object.keys(STATUS).map((s) => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) }))]} />
        <FilterSelect label="Audience" value={params.audience} onChange={(audience) => set({ audience })}
          options={[{ value: '', label: 'All audiences' }, ...AUDIENCES]} />
      </Toolbar>
      {list.isPending ? <Spinner /> : list.isError ? <ErrorState error={list.error} onRetry={() => list.refetch()} /> : rows.length === 0 ? (
        <EmptyState icon={Megaphone} title={params.search || params.status || params.audience ? 'No announcements match your filters' : 'No announcements yet'}
          description="Create a draft, preview it, then publish now or schedule it." />
      ) : (
        <div className="overflow-x-auto rounded-2xl bg-white shadow-panel">
          <table className="w-full text-left text-sm">
            <thead className="bg-thead text-[13px] font-semibold text-ink">
              <tr>
                <th scope="col" className="px-4 py-3">Announcement</th>
                <th scope="col" className="hidden px-3 py-3 md:table-cell">Audience</th>
                <th scope="col" className="px-3 py-3">Status</th>
                <th scope="col" className="hidden px-3 py-3 lg:table-cell">Schedule</th>
                <th scope="col" className="hidden px-3 py-3 sm:table-cell">Recipients</th>
                <th scope="col" className="px-3 py-3"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((a) => (
                <tr key={a.id} className="align-top">
                  <td className="px-4 py-3">
                    <p className="font-medium">{a.title}</p>
                    <p className="line-clamp-1 max-w-md text-xs text-muted">{a.body}</p>
                  </td>
                  <td className="hidden px-3 py-3 text-muted md:table-cell">
                    {AUDIENCE_LABEL[a.audience]}
                    {a.audience === 'selected_businesses' && <span className="block text-xs">{a.businesses.map((b) => b.name).join(', ')}</span>}
                  </td>
                  <td className="px-3 py-3"><span className={cn('rounded-md px-2 py-0.5 text-xs font-semibold', STATUS[a.status])}>{a.status}</span></td>
                  <td className="hidden px-3 py-3 text-xs text-muted lg:table-cell">
                    {a.starts_at ? `From ${formatDateTime(a.starts_at)}` : a.published_at ? `Since ${formatDateTime(a.published_at)}` : 'Immediately'}
                    {a.ends_at && <span className="block">Until {formatDateTime(a.ends_at)}</span>}
                  </td>
                  <td className="hidden px-3 py-3 tabular-nums sm:table-cell">{a.delivered_at ? a.recipient_count : '—'}</td>
                  <td className="px-3 py-3">
                    <ActionMenu items={[
                      { label: 'Edit', icon: Pencil, onSelect: () => setEditing(a), hidden: a.status === 'archived' },
                      { label: a.starts_at && new Date(a.starts_at) > new Date() ? 'Schedule' : 'Publish', icon: Send, onSelect: () => setPublishing(a), hidden: !['draft', 'unpublished'].includes(a.status) },
                      { label: 'Unpublish', icon: EyeOff, onSelect: () => run(a, 'unpublish'), hidden: !['published', 'scheduled'].includes(a.status) },
                      { label: 'Archive', icon: Archive, danger: true, onSelect: () => run(a, 'archive'), hidden: a.status === 'archived' },
                    ]} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {list.data && <Pagination page={params.page} totalPages={list.data.total_pages} count={list.data.count} pageSize={list.data.page_size} noun="announcements" onPage={(page) => setParams((p) => ({ ...p, page }))} />}

      {editing && <Editor announcement={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog open={Boolean(publishing)} onClose={() => setPublishing(null)} tone="primary" loading={act.isPending}
        title={publishing?.starts_at && new Date(publishing.starts_at) > new Date() ? 'Schedule this announcement?' : 'Publish this announcement?'}
        confirmLabel="Publish"
        description={publishing && (
          publishing.delivered_at
            ? 'It was delivered before, so it will reappear as a banner without notifying anyone again.'
            : `“${publishing.title}” goes to ${AUDIENCE_LABEL[publishing.audience].toLowerCase()} — ${publishCount.data?.recipients ?? '…'} people${publishing.send_email ? ' (email only to those who opted in)' : ''}. This can't be unsent.`
        )}
        onConfirm={() => publishing && run(publishing, 'publish')} />
    </RequirePlatformPermission>
  )
}
