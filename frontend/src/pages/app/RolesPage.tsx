import { zodResolver } from '@hookform/resolvers/zod'
import { Lock, Pencil, Plus, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { useDeleteRole, usePermissionCatalogue, useRoles, useSaveRole } from '@/api/businesses'
import { Button } from '@/components/ui/Button'
import { Card, PageHeader } from '@/components/ui/Card'
import { Alert, Badge, ErrorState, Spinner } from '@/components/ui/Feedback'
import { TextField } from '@/components/ui/Field'
import { ConfirmDialog, Modal } from '@/components/ui/Modal'
import { useActiveBusiness } from '@/features/business/BusinessContext'
import { RequirePermission } from '@/routes/guards'
import type { Permission, Role } from '@/types/api'
import { applyApiErrors } from '@/utils/formErrors'

const MODULE_LABELS: Record<string, string> = {
  business: 'Business',
  member: 'Team members',
  role: 'Roles',
  catalogue: 'Catalogues',
  product: 'Products',
  category: 'Categories',
  media: 'Media library',
  qrcode: 'QR codes',
  enquiry: 'Enquiries',
  customer: 'Customers',
  analytics: 'Analytics',
  subscription: 'Subscription',
  invoice: 'Invoices',
  settings: 'Settings',
  support: 'Support',
  audit_log: 'Activity log',
}

function groupByModule(perms: Permission[]) {
  const groups = new Map<string, Permission[]>()
  for (const p of perms) groups.set(p.module, [...(groups.get(p.module) ?? []), p])
  return [...groups.entries()]
}

const schema = z.object({
  name: z.string().trim().min(1, 'Give the role a name.').max(80),
  description: z.string().trim().max(255),
  permissions: z.array(z.string()),
})
type FormValues = z.infer<typeof schema>

function RoleEditor({
  role,
  open,
  onClose,
  canManage,
}: {
  role: Role | null
  open: boolean
  onClose: () => void
  canManage: boolean
}) {
  const { context } = useActiveBusiness()
  const catalogue = usePermissionCatalogue()
  const save = useSaveRole()
  const readOnly = Boolean(role?.is_system) || !canManage
  const mine = useMemo(() => new Set(context?.permissions ?? []), [context])
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    values: { name: role?.name ?? '', description: role?.description ?? '', permissions: role?.permissions ?? [] },
  })

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null)
    try {
      await save.mutateAsync({ id: role?.id, ...values })
      onClose()
    } catch (error) {
      setFormError(applyApiErrors(error, setError, ['name', 'description', 'permissions']))
    }
  })

  const title = readOnly ? role!.name : role ? `Edit ${role.name}` : 'New custom role'
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={title}
      description={
        role?.is_system
          ? 'System roles are maintained by myEcatalogues and cannot be edited.'
          : readOnly
            ? "You can view this role but don't have permission to change it."
            : 'You can only grant permissions that you hold yourself.'
      }
      footer={
        readOnly ? (
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" form="role-form" loading={isSubmitting}>
              Save role
            </Button>
          </>
        )
      }
    >
      <form id="role-form" onSubmit={onSubmit} noValidate className="space-y-5">
        {formError && <Alert tone="error">{formError}</Alert>}
        {errors.permissions?.message && <Alert tone="error">{errors.permissions.message}</Alert>}
        <fieldset disabled={readOnly} className="grid gap-4 sm:grid-cols-2">
          <TextField label="Role name" error={errors.name?.message} {...register('name')} />
          <TextField label="Description" error={errors.description?.message} {...register('description')} />
        </fieldset>
        {catalogue.isPending ? (
          <Spinner label="Loading permissions…" />
        ) : catalogue.isError ? (
          <ErrorState error={catalogue.error} onRetry={() => catalogue.refetch()} />
        ) : (
          <Controller
            control={control}
            name="permissions"
            render={({ field }) => {
              const selected = new Set(field.value)
              const toggle = (code: string, on: boolean) => {
                const next = new Set(selected)
                if (on) next.add(code)
                else next.delete(code)
                field.onChange([...next].sort())
              }
              return (
                <div className="grid gap-3 sm:grid-cols-2">
                  {groupByModule(catalogue.data).map(([module, perms]) => (
                    <fieldset key={module} className="rounded-lg border border-border p-3">
                      <legend className="px-1 text-sm font-semibold">{MODULE_LABELS[module] ?? module}</legend>
                      <div className="mt-1 space-y-1.5">
                        {perms.map((p) => {
                          const allowed = mine.has(p.code)
                          return (
                            <label
                              key={p.code}
                              className="flex items-start gap-2 text-sm"
                              title={allowed ? p.code : "You don't hold this permission, so you can't grant it."}
                            >
                              <input
                                type="checkbox"
                                className="mt-0.5 size-4 accent-brand-700"
                                checked={selected.has(p.code)}
                                disabled={readOnly || !allowed}
                                onChange={(e) => toggle(p.code, e.target.checked)}
                              />
                              <span className={allowed || readOnly ? '' : 'text-muted'}>{p.name}</span>
                            </label>
                          )
                        })}
                      </div>
                    </fieldset>
                  ))}
                </div>
              )
            }}
          />
        )}
      </form>
    </Modal>
  )
}

export function RolesPage() {
  const { businessId, can } = useActiveBusiness()
  const roles = useRoles(businessId)
  const remove = useDeleteRole()
  const [editing, setEditing] = useState<{ role: Role | null } | null>(null)
  const [deleting, setDeleting] = useState<Role | null>(null)
  const canManage = can('role.manage')

  return (
    <RequirePermission codes={['role.view']}>
      <PageHeader
        title="Roles & permissions"
        description="System roles cover common jobs. Create custom roles for anything more specific."
        action={
          canManage && (
            <Button icon={<Plus className="size-4" />} onClick={() => setEditing({ role: null })}>
              New role
            </Button>
          )
        }
      />
      {roles.isPending ? (
        <Spinner />
      ) : roles.isError ? (
        <ErrorState error={roles.error} onRetry={() => roles.refetch()} />
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {roles.data.map((role) => (
              <li key={role.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{role.name}</p>
                    {role.is_system ? (
                      <Badge>
                        <Lock className="mr-1 size-3" aria-hidden /> System
                      </Badge>
                    ) : (
                      <Badge tone="brand">Custom</Badge>
                    )}
                  </div>
                  {role.description && <p className="mt-0.5 text-sm text-muted">{role.description}</p>}
                  <p className="mt-1 text-xs text-muted">
                    {role.permissions.length} permissions · {role.member_count} member{role.member_count === 1 ? '' : 's'}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<Pencil className="size-4" />}
                    onClick={() => setEditing({ role })}
                  >
                    {role.is_system || !canManage ? 'View' : 'Edit'}
                  </Button>
                  {canManage && !role.is_system && (
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<Trash2 className="size-4" />}
                      onClick={() => setDeleting(role)}
                      aria-label={`Delete ${role.name}`}
                    />
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <RoleEditor
        open={editing !== null}
        role={editing?.role ?? null}
        canManage={canManage}
        onClose={() => setEditing(null)}
      />
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
        description="Roles that are still assigned to members can't be deleted."
        confirmLabel="Delete role"
      />
    </RequirePermission>
  )
}
