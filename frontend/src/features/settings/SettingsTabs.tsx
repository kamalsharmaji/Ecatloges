import { zodResolver } from '@hookform/resolvers/zod'
import {
  Bell,
  BookOpen,
  Building2,
  CreditCard,
  ExternalLink,
  Facebook,
  Instagram,
  KeyRound,
  Linkedin,
  Lock,
  Mail,
  MapPin,
  Phone,
  Receipt,
  ShieldCheck,
  Twitter,
  UserRound,
  Users,
  Youtube,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { z } from 'zod'
import { useUpdateBusiness } from '@/api/businesses'
import { useCatalogues } from '@/api/content'
import { useBusinessSettings, useNotificationPreferences, useUpdateBusinessSettings, useUpdateNotificationPreferences } from '@/api/settings'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Alert, ErrorState, Spinner } from '@/components/ui/Feedback'
import { TextField } from '@/components/ui/Field'
import { Switch } from '@/components/ui/Switch'
import { useToast } from '@/components/ui/toast'
import { useActiveBusiness } from '@/features/business/BusinessContext'
import { categoryLabel } from '@/features/business/constants'
import { BusinessForm } from '@/features/business/BusinessForm'
import { ImagePickerField } from '@/features/content/ImagePickerField'
import { MediaThumb } from '@/features/content/MediaThumb'
import type { SocialLinks, SocialNetwork } from '@/types/api'
import type { MediaBrief } from '@/types/content'
import type { NotificationPreference } from '@/types/settings'
import { applyApiErrors } from '@/utils/formErrors'

const SOCIAL: { key: SocialNetwork; label: string; icon: LucideIcon; placeholder: string }[] = [
  { key: 'facebook', label: 'Facebook', icon: Facebook, placeholder: 'https://facebook.com/yourpage' },
  { key: 'instagram', label: 'Instagram', icon: Instagram, placeholder: 'https://instagram.com/yourshop' },
  { key: 'youtube', label: 'YouTube', icon: Youtube, placeholder: 'https://youtube.com/@yourchannel' },
  { key: 'linkedin', label: 'LinkedIn', icon: Linkedin, placeholder: 'https://linkedin.com/company/yourcompany' },
  { key: 'x', label: 'X (Twitter)', icon: Twitter, placeholder: 'https://x.com/yourhandle' },
]

function ReadOnlyNotice({ what }: { what: string }) {
  return <Alert tone="info" className="mb-4">You can view {what}. Only members with permission to change it can edit.</Alert>
}

// --- Business profile --------------------------------------------------------------------------
function SocialLinksCard({ initial, editable }: { initial: SocialLinks; editable: boolean }) {
  const { context } = useActiveBusiness()
  const update = useUpdateBusiness(context?.business.id ?? '')
  const toast = useToast()
  const [links, setLinks] = useState<SocialLinks>(initial)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => setLinks(initial), [initial])
  const dirty = JSON.stringify(links) !== JSON.stringify(initial)

  return (
    <Card>
      <CardHeader title="Social Media Links" description="Shown in the footer of your public catalogues." />
      <CardBody className="space-y-3">
        {error && <Alert tone="error">{error}</Alert>}
        {SOCIAL.map(({ key, label, icon: Icon, placeholder }) => (
          <label key={key} className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-center gap-3 text-sm">
            <span className="flex items-center gap-2 font-medium"><Icon className="size-4 text-muted" aria-hidden /> {label}</span>
            <input type="url" inputMode="url" value={links[key] ?? ''} disabled={!editable} placeholder={placeholder}
              onChange={(e) => setLinks((l) => ({ ...l, [key]: e.target.value }))}
              className="h-10 w-full rounded-lg border border-border px-3 text-sm focus:border-brand-600 focus:outline-none disabled:bg-canvas" />
          </label>
        ))}
        {editable && (
          <div className="flex justify-end">
            <Button disabled={!dirty} loading={update.isPending}
              onClick={() => {
                setError(null)
                update.mutate({ social_links: links }, {
                  onSuccess: () => toast.show('Social links saved.'),
                  onError: (e) => setError(e instanceof Error ? e.message : 'Could not save the links.'),
                })
              }}>
              Save links
            </Button>
          </div>
        )}
      </CardBody>
    </Card>
  )
}

function PreviewCard({ logo }: { logo: MediaBrief | null | undefined }) {
  const { businessId, context, can } = useActiveBusiness()
  const catalogues = useCatalogues(can('catalogue.view') ? businessId : null, { status: 'published', page_size: 1 })
  if (!context) return null
  const b = context.business
  const live = catalogues.data?.results[0]
  return (
    <Card>
      <CardHeader title="Business Preview" />
      <CardBody className="space-y-3 text-sm">
        <div className="flex items-center gap-3">
          {logo ? <MediaThumb media={logo} className="size-14 rounded-xl" alt={`${b.name} logo`} /> : (
            <span className="flex size-14 items-center justify-center rounded-xl bg-brand-50 text-xl font-bold text-brand-700">{b.name[0]}</span>
          )}
          <div className="min-w-0">
            <p className="truncate text-base font-bold">{b.name}</p>
            <p className="text-muted">{categoryLabel(b.category)}</p>
          </div>
        </div>
        <ul className="space-y-1.5 text-slate-700">
          <li className="flex items-center gap-2"><MapPin className="size-4 text-muted" aria-hidden /> {[b.city, b.state].filter(Boolean).join(', ')}</li>
          <li className="flex items-center gap-2"><Phone className="size-4 text-muted" aria-hidden /> {b.phone}</li>
          <li className="flex items-center gap-2"><Mail className="size-4 text-muted" aria-hidden /> <span className="truncate">{b.email}</span></li>
        </ul>
        {live ? (
          <a href={live.public_url} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 rounded-lg bg-brand-700 px-4 py-2.5 font-medium text-white hover:bg-brand-800">
            View Catalogue <ExternalLink className="size-4" aria-hidden />
          </a>
        ) : (
          <p className="rounded-lg bg-canvas px-3 py-2 text-xs text-muted">Publish a catalogue to get a public link.</p>
        )}
      </CardBody>
    </Card>
  )
}

export function ProfileTab() {
  const { businessId, context, can } = useActiveBusiness()
  const update = useUpdateBusiness(context?.business.id ?? '')
  const settings = useBusinessSettings(businessId)
  if (!context) return null
  const editable = can('business.update')
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="space-y-6">
        {!editable && <ReadOnlyNotice what="the business profile" />}
        <Card>
          <CardHeader title="Business Profile" description="Used on your catalogues, invoices and customer communications." />
          <CardBody>
            <BusinessForm initial={context.business} readOnly={!editable} submitLabel="Save Changes" onSubmit={(values) => update.mutateAsync(values)} />
          </CardBody>
        </Card>
        <SocialLinksCard initial={context.business.social_links ?? {}} editable={editable} />
      </div>
      <div className="space-y-6 xl:sticky xl:top-20 xl:self-start">
        <PreviewCard logo={settings.data?.logo} />
      </div>
    </div>
  )
}

// --- Branding & catalogue defaults ---------------------------------------------------------------
const brandingSchema = z.object({
  brand_color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a hex colour like #1d4ed8.'),
  default_whatsapp_number: z.string().trim().regex(/^$|^\+?[0-9][0-9\s\-()]{6,18}$/, 'Enter a valid WhatsApp number.'),
  default_show_prices: z.boolean(),
  default_enquiries_enabled: z.boolean(),
  enquiry_email_enabled: z.boolean(),
})
type BrandingValues = z.infer<typeof brandingSchema>

function useSettingsForm() {
  const { businessId, can } = useActiveBusiness()
  const settings = useBusinessSettings(businessId)
  const save = useUpdateBusinessSettings()
  return { settings, save, editable: can('settings.update') }
}

export function BrandingTab() {
  const { settings, save, editable } = useSettingsForm()
  const toast = useToast()
  const [error, setError] = useState<string | null>(null)
  const form = useForm<BrandingValues>({ resolver: zodResolver(brandingSchema) })
  const { register, handleSubmit, reset, watch, setError: setFieldError, formState: { errors, isDirty } } = form
  useEffect(() => { if (settings.data) reset(settings.data) }, [settings.data, reset])
  if (settings.isPending) return <Spinner />
  if (settings.isError) return <ErrorState error={settings.error} onRetry={() => settings.refetch()} />
  const color = watch('brand_color') ?? settings.data.brand_color

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {!editable && <div className="lg:col-span-2"><ReadOnlyNotice what="branding" /></div>}
      <Card>
        <CardHeader title="Business Logo" description="Shown on your public catalogues when a catalogue has no logo of its own." />
        <CardBody>
          <ImagePickerField label="Logo" folder="catalogues" aspect="aspect-square max-w-48" disabled={!editable || save.isPending}
            value={settings.data.logo} hint="PNG or JPG from your media library."
            onChange={(media) => save.mutate({ logo_id: media?.id ?? null }, {
              onSuccess: () => toast.show(media ? 'Logo updated.' : 'Logo removed.'),
              onError: (e) => toast.show(e.message, 'error'),
            })} />
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Brand Colour" description="New catalogues start with this colour (buttons, highlights)." />
        <CardBody>
          <form noValidate onSubmit={handleSubmit((v) => {
            setError(null)
            save.mutate({ brand_color: v.brand_color }, {
              onSuccess: () => toast.show('Brand colour saved.'),
              onError: (e) => setError(applyApiErrors(e, setFieldError, ['brand_color'])),
            })
          })} className="space-y-4">
            {error && <Alert tone="error">{error}</Alert>}
            <div className="flex items-end gap-3">
              <input type="color" aria-label="Pick brand colour" value={color} disabled={!editable}
                onChange={(e) => form.setValue('brand_color', e.target.value, { shouldDirty: true, shouldValidate: true })}
                className="h-10 w-14 cursor-pointer rounded-lg border border-border" />
              <div className="flex-1"><TextField label="Hex value" error={errors.brand_color?.message} disabled={!editable} {...register('brand_color')} /></div>
            </div>
            <div className="rounded-xl border border-border p-4">
              <p className="text-xs text-muted">Preview</p>
              <div className="mt-2 flex items-center gap-3">
                <span className="rounded-lg px-4 py-2 text-sm font-semibold text-white" style={{ backgroundColor: color }}>View Products</span>
                <span className="text-sm font-semibold" style={{ color }}>₹2,499</span>
              </div>
            </div>
            {editable && <div className="flex justify-end"><Button type="submit" disabled={!isDirty} loading={save.isPending}>Save colour</Button></div>}
          </form>
        </CardBody>
      </Card>
    </div>
  )
}

export function CatalogueDefaultsTab() {
  const { settings, save, editable } = useSettingsForm()
  const toast = useToast()
  const [error, setError] = useState<string | null>(null)
  const { register, handleSubmit, reset, watch, setValue, setError: setFieldError, formState: { errors, isDirty } } = useForm<BrandingValues>({ resolver: zodResolver(brandingSchema) })
  useEffect(() => { if (settings.data) reset(settings.data) }, [settings.data, reset])
  if (settings.isPending) return <Spinner />
  if (settings.isError) return <ErrorState error={settings.error} onRetry={() => settings.refetch()} />

  const toggle = (name: 'default_show_prices' | 'default_enquiries_enabled' | 'enquiry_email_enabled', label: string, hint: string) => (
    <div className="flex items-start justify-between gap-4 py-3">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted">{hint}</p>
      </div>
      <Switch label={label} checked={Boolean(watch(name))} disabled={!editable} onChange={(v) => setValue(name, v, { shouldDirty: true })} />
    </div>
  )

  return (
    <Card>
      <CardHeader title="Catalogue Settings" description="Defaults for new catalogues. Existing catalogues keep their own settings." />
      <CardBody>
        {!editable && <ReadOnlyNotice what="catalogue settings" />}
        <form noValidate onSubmit={handleSubmit((v) => {
          setError(null)
          save.mutate({
            default_whatsapp_number: v.default_whatsapp_number, default_show_prices: v.default_show_prices,
            default_enquiries_enabled: v.default_enquiries_enabled, enquiry_email_enabled: v.enquiry_email_enabled,
          }, {
            onSuccess: () => toast.show('Catalogue settings saved.'),
            onError: (e) => setError(applyApiErrors(e, setFieldError, ['default_whatsapp_number'])),
          })
        })} className="space-y-2">
          {error && <Alert tone="error">{error}</Alert>}
          <div className="max-w-sm">
            <TextField label="Default WhatsApp number" type="tel" placeholder="+91 98765 43210" disabled={!editable}
              error={errors.default_whatsapp_number?.message} {...register('default_whatsapp_number')} />
          </div>
          <div className="divide-y divide-border">
            {toggle('default_show_prices', 'Show prices', 'New catalogues display product prices.')}
            {toggle('default_enquiries_enabled', 'Accept enquiries', 'New catalogues show the enquiry form and WhatsApp button.')}
            {toggle('enquiry_email_enabled', 'Email new enquiries to the business', 'Each enquiry is emailed to the business email address. In-app notifications are not affected.')}
          </div>
          {editable && <div className="flex justify-end pt-2"><Button type="submit" disabled={!isDirty} loading={save.isPending}>Save settings</Button></div>}
        </form>
      </CardBody>
    </Card>
  )
}

// --- Notification preferences --------------------------------------------------------------------
function ChannelCell({ pref, channel, onChange, busy }: {
  pref: NotificationPreference; channel: 'in_app' | 'email'; onChange: (v: boolean) => void; busy: boolean
}) {
  const available = channel === 'in_app' ? pref.in_app_available : pref.email_available
  const locked = channel === 'in_app' ? pref.in_app_locked : pref.email_locked
  const value = pref[channel]
  if (!available) return <span className="text-xs text-muted">—</span>
  if (locked) return <span className="inline-flex items-center gap-1 text-xs font-medium text-muted"><Lock className="size-3.5" aria-hidden /> Always on</span>
  return <Switch label={`${pref.label} ${channel === 'in_app' ? 'in-app' : 'email'}`} checked={Boolean(value)} disabled={busy} onChange={onChange} />
}

export function NotificationsTab() {
  const prefs = useNotificationPreferences()
  const update = useUpdateNotificationPreferences()
  const toast = useToast()
  if (prefs.isPending) return <Spinner />
  if (prefs.isError) return <ErrorState error={prefs.error} onRetry={() => prefs.refetch()} />
  const change = (key: string, channel: 'in_app' | 'email', value: boolean) =>
    update.mutate([{ key, [channel]: value }], {
      onSuccess: () => toast.show('Preference saved.'),
      onError: (e) => toast.show(e.message, 'error'),
    })

  return (
    <Card>
      <CardHeader title="Notification Preferences" description="Your personal settings — they don't change what your teammates receive." />
      <CardBody className="p-0">
        <table className="w-full text-left text-sm">
          <thead className="bg-thead text-[13px] font-semibold text-ink">
            <tr>
              <th scope="col" className="px-5 py-3">Notification</th>
              <th scope="col" className="w-28 px-3 py-3 text-center">In-app</th>
              <th scope="col" className="w-28 px-3 py-3 text-center">Email</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {prefs.data.map((p) => (
              <tr key={p.key}>
                <td className="px-5 py-3.5">
                  <p className="font-medium">{p.label}</p>
                  <p className="text-xs text-muted">{p.description}</p>
                  {p.note && <p className="mt-0.5 text-xs text-brand-700">{p.note}</p>}
                </td>
                <td className="px-3 py-3.5 text-center"><ChannelCell pref={p} channel="in_app" busy={update.isPending} onChange={(v) => change(p.key, 'in_app', v)} /></td>
                <td className="px-3 py-3.5 text-center"><ChannelCell pref={p} channel="email" busy={update.isPending} onChange={(v) => change(p.key, 'email', v)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardBody>
    </Card>
  )
}

// --- Link tabs ---------------------------------------------------------------------------------------
type LinkCard = { to: string; title: string; text: string; icon: LucideIcon; requires?: string }

function LinkGrid({ items }: { items: LinkCard[] }) {
  const { can } = useActiveBusiness()
  const visible = items.filter((i) => !i.requires || can(i.requires))
  if (!visible.length) return <Alert tone="info">Your role doesn't include access to these settings.</Alert>
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {visible.map(({ to, title, text, icon: Icon }) => (
        <li key={title}>
          <Link to={to} className="flex h-full gap-3 rounded-2xl bg-white p-4 shadow-panel hover:border-brand-300 hover:shadow">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700"><Icon className="size-5" aria-hidden /></span>
            <span>
              <span className="block font-semibold">{title}</span>
              <span className="text-sm text-muted">{text}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

export function StaffTab() {
  return (
    <LinkGrid items={[
      { to: '/app/team', title: 'Team Members', text: 'Invite people, change roles, suspend or remove members.', icon: Users, requires: 'member.view' },
      { to: '/app/roles', title: 'Roles & Permissions', text: 'System roles and your custom roles.', icon: ShieldCheck, requires: 'role.view' },
      { to: '/app/activity', title: 'Activity Log', text: 'Who changed what in your business.', icon: BookOpen, requires: 'audit_log.view' },
    ]} />
  )
}

export function AccountBillingTab() {
  return (
    <LinkGrid items={[
      { to: '/app/account', title: 'My Profile', text: 'Your name and mobile number.', icon: UserRound },
      { to: '/app/account', title: 'Password & Security', text: 'Change your password (requires your current password). Email changes are not self-service yet.', icon: KeyRound },
      { to: '/app/billing', title: 'Subscription', text: 'Your plan, renewals and plan changes.', icon: CreditCard, requires: 'subscription.view' },
      { to: '/app/billing/invoices', title: 'Invoices', text: 'Download invoices for your payments.', icon: Receipt, requires: 'invoice.view' },
      { to: '/app/business', title: 'Business record', text: 'The full business profile form.', icon: Building2, requires: 'business.view' },
      { to: '/app/notifications', title: 'Notification inbox', text: 'Everything you have been notified about.', icon: Bell },
    ]} />
  )
}
