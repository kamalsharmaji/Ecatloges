import { zodResolver } from '@hookform/resolvers/zod'
import { CircleCheck, Database, FlaskConical, Package, Pencil, Plus, Trash2, Users } from 'lucide-react'
import { useState } from 'react'
import { useForm, type UseFormRegister } from 'react-hook-form'
import { z } from 'zod'
import { useAdminPlans, useDeleteAdminPlan, useSaveAdminPlan } from '@/api/billing'
import { PageHero } from '@/components/panel/PageHero'
import { StatCard, StatGrid } from '@/components/panel/StatCard'
import { Button } from '@/components/ui/Button'
import { rowIconButton } from '@/components/ui/buttonStyles'
import { Card } from '@/components/ui/Card'
import { Alert, Badge, EmptyState, ErrorState, Spinner } from '@/components/ui/Feedback'
import { Checkbox, SelectField, TextAreaField, TextField } from '@/components/ui/Field'
import { ConfirmDialog, Modal } from '@/components/ui/Modal'
import { useAuth } from '@/features/auth/AuthContext'
import { formatMoney, intervalLabel } from '@/features/billing/format'
import { RequirePlatformPermission } from '@/routes/guards'
import type { AdminPlan } from '@/types/billing'
import { cn } from '@/utils/cn'
import { applyApiErrors } from '@/utils/formErrors'

const PLAN_TONES = ['bg-[#e0edff] text-[#1f6fff]', 'bg-[#efe4ff] text-[#7c3aed]', 'bg-[#fff1d6] text-[#f08c00]', 'bg-[#dcf7e5] text-[#16a34a]']
const limit = (v: number | null) => (v === null ? 'Unlimited' : v.toLocaleString())

// Optional limits are edited as text: empty = unlimited.
const optionalInt = z.string().trim().regex(/^$|^\d+$/, 'Whole number, or empty for unlimited.')

const schema = z.object({
  code: z.string().trim().regex(/^[a-z0-9-]+$/, 'Lowercase letters, numbers and dashes.').min(2).max(60),
  name: z.string().trim().min(1, 'Required.').max(100),
  description: z.string().max(2000),
  price: z.string().trim().regex(/^\d+(\.\d{1,2})?$/, 'Amount like 999 or 999.00.'),
  currency: z.string().trim().length(3, '3-letter code.'),
  interval: z.enum(['month', 'year']),
  tier_rank: z.string().regex(/^\d+$/, 'Whole number.'),
  sort_order: z.string().regex(/^\d+$/, 'Whole number.'),
  max_catalogues: optionalInt,
  max_products: optionalInt,
  max_staff: optionalInt,
  storage_limit_mb: optionalInt,
  max_image_size_mb: optionalInt,
  max_video_size_mb: optionalInt,
  video_uploads_enabled: z.boolean(),
  custom_branding: z.boolean(),
  analytics_enabled: z.boolean(),
  csv_import_enabled: z.boolean(),
  is_active: z.boolean(),
  is_public: z.boolean(),
})
type FormValues = z.infer<typeof schema>

const LIMIT_INPUTS = [
  ['max_catalogues', 'Catalogues'],
  ['max_products', 'Products'],
  ['max_staff', 'Team seats'],
  ['storage_limit_mb', 'Storage (MB)'],
  ['max_image_size_mb', 'Max image size (MB)'],
  ['max_video_size_mb', 'Max video size (MB)'],
] as const

const FLAGS = [
  ['video_uploads_enabled', 'Video uploads'],
  ['analytics_enabled', 'Analytics'],
  ['csv_import_enabled', 'CSV import'],
  ['custom_branding', 'Custom branding'],
  ['is_active', 'Active (can be purchased)'],
  ['is_public', 'Listed on the pricing page'],
] as const

const str = (v: number | null) => (v === null ? '' : String(v))
const num = (v: string) => (v.trim() === '' ? null : Number(v))

function toForm(plan: AdminPlan | null): FormValues {
  return {
    code: plan?.code ?? '',
    name: plan?.name ?? '',
    description: plan?.description ?? '',
    price: plan?.price ?? '',
    currency: plan?.currency ?? 'INR',
    interval: plan?.interval ?? 'month',
    tier_rank: String(plan?.tier_rank ?? 1),
    sort_order: String(plan?.sort_order ?? 0),
    max_catalogues: str(plan?.max_catalogues ?? null),
    max_products: str(plan?.max_products ?? null),
    max_staff: str(plan?.max_staff ?? null),
    storage_limit_mb: str(plan?.storage_limit_mb ?? null),
    max_image_size_mb: str(plan?.max_image_size_mb ?? null),
    max_video_size_mb: str(plan?.max_video_size_mb ?? null),
    video_uploads_enabled: plan?.video_uploads_enabled ?? false,
    custom_branding: plan?.custom_branding ?? false,
    analytics_enabled: plan?.analytics_enabled ?? false,
    csv_import_enabled: plan?.csv_import_enabled ?? false,
    is_active: plan?.is_active ?? true,
    is_public: plan?.is_public ?? true,
  }
}

function PlanEditor({ plan, open, onClose, readOnly }: { plan: AdminPlan | null; open: boolean; onClose: () => void; readOnly: boolean }) {
  const save = useSaveAdminPlan()
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), values: toForm(plan) })

  const onSubmit = handleSubmit(async (v) => {
    setFormError(null)
    try {
      await save.mutateAsync({
        id: plan?.id,
        ...v,
        currency: v.currency.toUpperCase(),
        tier_rank: Number(v.tier_rank),
        sort_order: Number(v.sort_order),
        max_catalogues: num(v.max_catalogues),
        max_products: num(v.max_products),
        max_staff: num(v.max_staff),
        storage_limit_mb: num(v.storage_limit_mb),
        max_image_size_mb: num(v.max_image_size_mb),
        max_video_size_mb: num(v.max_video_size_mb),
      })
      onClose()
    } catch (error) {
      setFormError(applyApiErrors(error, setError, Object.keys(schema.shape)))
    }
  })

  const reg = register as UseFormRegister<FormValues>
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={plan ? `Edit ${plan.name}` : 'New plan'}
      description="Changes apply to new purchases only. Existing subscriptions and invoices keep the price and limits they were bought with."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {readOnly ? 'Close' : 'Cancel'}
          </Button>
          {!readOnly && (
            <Button type="submit" form="plan-form" loading={isSubmitting}>
              Save plan
            </Button>
          )}
        </>
      }
    >
      <form id="plan-form" onSubmit={onSubmit} noValidate>
        <fieldset disabled={readOnly} className="space-y-5">
          {formError && <Alert tone="error">{formError}</Alert>}
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Name" error={errors.name?.message} {...reg('name')} />
            <TextField label="Code" hint="Stable identifier, e.g. growth-monthly" error={errors.code?.message} {...reg('code')} />
            <TextField label="Price" inputMode="decimal" error={errors.price?.message} {...reg('price')} />
            <TextField label="Currency" maxLength={3} error={errors.currency?.message} {...reg('currency')} />
            <SelectField label="Billing interval" error={errors.interval?.message} {...reg('interval')}>
              <option value="month">Monthly</option>
              <option value="year">Yearly</option>
            </SelectField>
            <TextField label="Tier rank" hint="Higher = upgrade" error={errors.tier_rank?.message} {...reg('tier_rank')} />
            <TextField label="Sort order" error={errors.sort_order?.message} {...reg('sort_order')} />
          </div>
          <TextAreaField label="Description" error={errors.description?.message} {...reg('description')} />
          <div>
            <p className="mb-2 text-sm font-semibold">Limits (empty = unlimited)</p>
            <div className="grid gap-4 sm:grid-cols-3">
              {LIMIT_INPUTS.map(([name, label]) => (
                <TextField key={name} label={label} inputMode="numeric" error={errors[name]?.message} {...reg(name)} />
              ))}
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {FLAGS.map(([name, label]) => (
              <Checkbox key={name} label={label} {...reg(name)} />
            ))}
          </div>
        </fieldset>
      </form>
    </Modal>
  )
}

export function AdminPlansPage() {
  const { user } = useAuth()
  const canManage = Boolean(user?.platform_permissions.includes('platform.plan.manage'))
  const plans = useAdminPlans()
  const remove = useDeleteAdminPlan()
  const [editing, setEditing] = useState<{ plan: AdminPlan | null } | null>(null)
  const [deleting, setDeleting] = useState<AdminPlan | null>(null)

  return (
    <RequirePlatformPermission code="platform.plan.view">
      <PageHero
        icon={Database}
        title="Plans & Pricing Management"
        description="Create and manage subscription plans, pricing and feature limits."
        action={
          canManage && (
            <Button icon={<Plus className="size-4" />} onClick={() => setEditing({ plan: null })}>
              Add New Plan
            </Button>
          )
        }
      />
      {plans.data && (
        <StatGrid>
          <StatCard icon={Database} tone="violet" label="Total Plans" value={plans.data.results.length} hint={`${plans.data.results.filter((p) => p.is_public).length} public`} />
          <StatCard icon={CircleCheck} tone="green" label="Active Plans" value={plans.data.results.filter((p) => p.is_active).length} hint="On sale" />
          <StatCard icon={Users} tone="amber" label="Total Subscribers" value={plans.data.results.reduce((n, p) => n + p.subscriber_count, 0)} hint="Using these plans" />
          <StatCard icon={FlaskConical} tone="slate" label="Dev Placeholders" value={plans.data.results.filter((p) => p.is_development_seed).length} hint="Replace before launch" />
        </StatGrid>
      )}
      {plans.isPending ? (
        <Spinner />
      ) : plans.isError ? (
        <ErrorState error={plans.error} onRetry={() => plans.refetch()} />
      ) : plans.data.results.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No plans yet"
          description="Create plans once prices and limits are approved. For local development run: python manage.py seed_dev_plans"
        />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-thead text-[13px] font-semibold text-ink">
                <tr>
                  <th scope="col" className="w-12 px-5 py-3">#</th>
                  <th scope="col" className="px-3 py-3">Plan Name</th>
                  <th scope="col" className="px-3 py-3">Price</th>
                  <th scope="col" className="hidden px-3 py-3 lg:table-cell">Catalogues</th>
                  <th scope="col" className="hidden px-3 py-3 lg:table-cell">Products</th>
                  <th scope="col" className="hidden px-3 py-3 xl:table-cell">Storage</th>
                  <th scope="col" className="hidden px-3 py-3 xl:table-cell">Team Members</th>
                  <th scope="col" className="px-3 py-3">Status</th>
                  <th scope="col" className="px-3 py-3">Subscribers</th>
                  <th scope="col" className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-ink">
                {plans.data.results.map((plan, i) => (
                  <tr key={plan.id}>
                    <td className="px-5 py-3">{i + 1}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-3">
                        <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', PLAN_TONES[i % PLAN_TONES.length])}><Package className="size-[18px]" aria-hidden /></span>
                        <div className="min-w-0">
                          <p className="font-semibold">
                            {plan.name}{' '}
                            {plan.is_development_seed && (
                              <Badge tone="warning">
                                <FlaskConical className="mr-1 size-3" aria-hidden /> Dev placeholder
                              </Badge>
                            )}
                          </p>
                          <p className="text-xs text-body">{plan.description || `${plan.code} · tier ${plan.tier_rank}`}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 font-semibold whitespace-nowrap">
                      {formatMoney(plan.price, plan.currency).replace(/\.00$/, '')} <span className="font-normal text-body">/ {intervalLabel(plan.interval)}</span>
                    </td>
                    <td className="hidden px-3 py-3 lg:table-cell">{limit(plan.max_catalogues)}</td>
                    <td className="hidden px-3 py-3 lg:table-cell">{limit(plan.max_products)}</td>
                    <td className="hidden px-3 py-3 xl:table-cell">{plan.storage_limit_mb === null ? 'Unlimited' : plan.storage_limit_mb >= 1024 ? `${+(plan.storage_limit_mb / 1024).toFixed(1)} GB` : `${plan.storage_limit_mb} MB`}</td>
                    <td className="hidden px-3 py-3 xl:table-cell">{limit(plan.max_staff)}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1">
                        <Badge tone={plan.is_active ? 'success' : 'neutral'}>{plan.is_active ? 'Active' : 'Inactive'}</Badge>
                        {!plan.is_public && <Badge>Hidden</Badge>}
                      </div>
                    </td>
                    <td className="px-3 py-3">{plan.subscriber_count}</td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-1.5">
                        <button type="button" className={rowIconButton} aria-label={`${canManage ? 'Edit' : 'View'} ${plan.name}`} title={canManage ? 'Edit' : 'View'} onClick={() => setEditing({ plan })}>
                          <Pencil className="size-4" />
                        </button>
                        {canManage && (
                          <button type="button" className={cn(rowIconButton, 'bg-[#ffe9ec] text-red-600 hover:bg-[#ffd7dd]')} aria-label={`Delete ${plan.name}`} title="Delete" onClick={() => setDeleting(plan)}>
                            <Trash2 className="size-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <PlanEditor plan={editing?.plan ?? null} open={editing !== null} onClose={() => setEditing(null)} readOnly={!canManage} />
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => {
          setDeleting(null)
          remove.reset()
        }}
        onConfirm={() => deleting && remove.mutate(deleting.id, { onSuccess: () => setDeleting(null) })}
        loading={remove.isPending}
        error={remove.error?.message}
        title={`Delete “${deleting?.name}”?`}
        description="Only plans that were never purchased can be deleted. Deactivate a plan to stop selling it."
        confirmLabel="Delete plan"
      />
    </RequirePlatformPermission>
  )
}
