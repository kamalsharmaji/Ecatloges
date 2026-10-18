import { zodResolver } from '@hookform/resolvers/zod'
import { Crown, MailPlus, Pencil, Search, X } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import {
  useInvitations,
  useInviteMember,
  useMembers,
  useRemoveMember,
  useRevokeInvitation,
  useRoles,
  useTransferOwnership,
  useUpdateMember,
} from '@/api/businesses'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader, PageHeader } from '@/components/ui/Card'
import { Alert, Badge, ErrorState, Spinner } from '@/components/ui/Feedback'
import { SelectField, TextField } from '@/components/ui/Field'
import { ConfirmDialog, Modal } from '@/components/ui/Modal'
import { Pagination } from '@/components/ui/Pagination'
import { useActiveBusiness } from '@/features/business/BusinessContext'
import { assignableRoles } from '@/features/team/roleOptions'
import { RequirePermission } from '@/routes/guards'
import type { Membership } from '@/types/api'
import { applyApiErrors, errorMessage } from '@/utils/formErrors'

const dateFmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })

// --- Invite --------------------------------------------------------------------------------
const inviteSchema = z.object({
  email: z.string().trim().email('Enter a valid email address.'),
  role_id: z.string().min(1, 'Choose a role.'),
})
type InviteValues = z.infer<typeof inviteSchema>

function InviteModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { businessId, context } = useActiveBusiness()
  const roles = useRoles(businessId)
  const invite = useInviteMember()
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<InviteValues>({ resolver: zodResolver(inviteSchema), defaultValues: { email: '', role_id: '' } })

  const close = () => {
    reset()
    setFormError(null)
    onClose()
  }

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null)
    try {
      await invite.mutateAsync(values)
      close()
    } catch (error) {
      setFormError(applyApiErrors(error, setError, ['email', 'role_id']))
    }
  })

  const options = assignableRoles(roles.data, context)
  return (
    <Modal
      open={open}
      onClose={close}
      title="Invite a team member"
      description="They'll get an email with a link to join. Invitations expire after 7 days."
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" form="invite-form" loading={isSubmitting}>
            Send invitation
          </Button>
        </>
      }
    >
      <form id="invite-form" onSubmit={onSubmit} noValidate className="space-y-4">
        {formError && <Alert tone="error">{formError}</Alert>}
        {roles.isError && <Alert tone="error">Couldn't load roles: {roles.error.message}</Alert>}
        <TextField label="Email address" type="email" autoComplete="off" error={errors.email?.message} {...register('email')} />
        <SelectField label="Role" error={errors.role_id?.message} {...register('role_id')}>
          <option value="">{roles.isPending ? 'Loading roles…' : 'Choose a role'}</option>
          {options.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </SelectField>
      </form>
    </Modal>
  )
}

// --- Edit member ---------------------------------------------------------------------------
function EditMemberModal({ member, onClose }: { member: Membership | null; onClose: () => void }) {
  const { businessId, context } = useActiveBusiness()
  const roles = useRoles(businessId)
  const update = useUpdateMember()
  const remove = useRemoveMember()
  const transfer = useTransferOwnership()
  const [roleId, setRoleId] = useState('')
  const [confirm, setConfirm] = useState<'remove' | 'transfer' | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!member) return null
  const options = assignableRoles(roles.data, context)
  const selectedRole = roleId || member.role.id
  const close = () => {
    setRoleId('')
    setError(null)
    setConfirm(null)
    onClose()
  }
  const run = async (fn: () => Promise<unknown>) => {
    setError(null)
    try {
      await fn()
      close()
    } catch (e) {
      setConfirm(null)
      setError(errorMessage(e))
    }
  }

  return (
    <>
      <Modal
        open={confirm === null}
        onClose={close}
        title={member.user.full_name}
        description={member.user.email}
        footer={
          <>
            <Button variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button
              loading={update.isPending}
              disabled={selectedRole === member.role.id}
              onClick={() => run(() => update.mutateAsync({ id: member.id, role_id: selectedRole }))}
            >
              Save role
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          {error && <Alert tone="error">{error}</Alert>}
          <SelectField label="Role" value={selectedRole} onChange={(e) => setRoleId(e.target.value)}>
            {!options.some((r) => r.id === member.role.id) && <option value={member.role.id}>{member.role.name}</option>}
            {options.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </SelectField>

          <div className="space-y-3 rounded-lg border border-border p-4">
            <p className="text-sm font-medium">Access</p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="sm"
                loading={update.isPending}
                onClick={() =>
                  run(() =>
                    update.mutateAsync({ id: member.id, status: member.status === 'active' ? 'suspended' : 'active' }),
                  )
                }
              >
                {member.status === 'active' ? 'Suspend access' : 'Restore access'}
              </Button>
              {context?.is_owner && !member.is_owner && member.status === 'active' && (
                <Button variant="secondary" size="sm" icon={<Crown className="size-4" />} onClick={() => setConfirm('transfer')}>
                  Transfer ownership
                </Button>
              )}
              <Button variant="danger" size="sm" onClick={() => setConfirm('remove')}>
                Remove from business
              </Button>
            </div>
          </div>
        </div>
      </Modal>
      <ConfirmDialog
        open={confirm === 'remove'}
        onClose={() => setConfirm(null)}
        onConfirm={() => run(() => remove.mutateAsync(member.id))}
        loading={remove.isPending}
        title="Remove this member?"
        description={`${member.user.full_name} will lose access to this business immediately.`}
        confirmLabel="Remove"
      />
      <ConfirmDialog
        open={confirm === 'transfer'}
        onClose={() => setConfirm(null)}
        onConfirm={() => run(() => transfer.mutateAsync(member.id))}
        loading={transfer.isPending}
        tone="primary"
        title="Transfer ownership?"
        description={`${member.user.full_name} becomes the owner, and your role changes to Business Admin. You can't undo this yourself.`}
        confirmLabel="Transfer ownership"
      />
    </>
  )
}

// --- Page ----------------------------------------------------------------------------------
function MembersCard({ onEdit }: { onEdit: (m: Membership) => void }) {
  const { businessId, context, can } = useActiveBusiness()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const members = useMembers(businessId, { page, search: search || undefined })
  const canManage = can('member.manage')

  return (
    <Card>
      <CardHeader
        title="Members"
        action={
          <label className="relative block w-full sm:w-64">
            <span className="sr-only">Search members</span>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <input
              type="search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
              placeholder="Search name or email"
              className="h-9 w-full rounded-lg border border-border bg-white pr-3 pl-9 text-sm focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20 focus:outline-none"
            />
          </label>
        }
      />
      <CardBody className="p-0">
        {members.isPending ? (
          <Spinner />
        ) : members.isError ? (
          <div className="p-5">
            <ErrorState error={members.error} onRetry={() => members.refetch()} />
          </div>
        ) : members.data.results.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted">No members match your search.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-canvas text-xs font-medium tracking-wide text-muted uppercase">
                <tr>
                  <th scope="col" className="px-5 py-3">Member</th>
                  <th scope="col" className="px-5 py-3">Role</th>
                  <th scope="col" className="px-5 py-3">Status</th>
                  <th scope="col" className="hidden px-5 py-3 md:table-cell">Joined</th>
                  <th scope="col" className="px-5 py-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {members.data.results.map((m) => {
                  const isMe = m.id === context?.membership_id
                  const editable = canManage && !isMe && (!m.is_owner || context?.is_owner)
                  return (
                    <tr key={m.id}>
                      <td className="px-5 py-3">
                        <p className="font-medium">
                          {m.user.full_name} {isMe && <span className="text-xs text-muted">(you)</span>}
                        </p>
                        <p className="text-xs text-muted">{m.user.email}</p>
                      </td>
                      <td className="px-5 py-3">
                        <Badge tone={m.is_owner ? 'brand' : 'neutral'}>{m.role.name}</Badge>
                      </td>
                      <td className="px-5 py-3">
                        <Badge tone={m.status === 'active' ? 'success' : 'warning'}>
                          {m.status === 'active' ? 'Active' : 'Suspended'}
                        </Badge>
                      </td>
                      <td className="hidden px-5 py-3 text-muted md:table-cell">{dateFmt.format(new Date(m.created_at))}</td>
                      <td className="px-5 py-3 text-right">
                        {editable && (
                          <Button variant="ghost" size="sm" icon={<Pencil className="size-4" />} onClick={() => onEdit(m)}>
                            Manage
                          </Button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        {members.data && (
          <div className="px-5 pb-4">
            <Pagination page={page} totalPages={members.data.total_pages} count={members.data.count} onPage={setPage} />
          </div>
        )}
      </CardBody>
    </Card>
  )
}

function InvitationsCard() {
  const { businessId, can } = useActiveBusiness()
  const invitations = useInvitations(businessId)
  const revoke = useRevokeInvitation()

  return (
    <Card>
      <CardHeader title="Pending invitations" />
      <CardBody className="p-0">
        {invitations.isPending ? (
          <Spinner />
        ) : invitations.isError ? (
          <div className="p-5">
            <ErrorState error={invitations.error} onRetry={() => invitations.refetch()} />
          </div>
        ) : invitations.data.results.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted">No pending invitations.</p>
        ) : (
          <ul className="divide-y divide-border">
            {invitations.data.results.map((inv) => (
              <li key={inv.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{inv.email}</p>
                  <p className="text-xs text-muted">
                    {inv.role.name} · {inv.is_expired ? 'Expired' : `Expires ${dateFmt.format(new Date(inv.expires_at))}`}
                  </p>
                </div>
                {inv.is_expired && <Badge tone="warning">Expired</Badge>}
                {can('member.invite') && (
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<X className="size-4" />}
                    loading={revoke.isPending && revoke.variables === inv.id}
                    onClick={() => revoke.mutate(inv.id)}
                  >
                    Revoke
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        {revoke.isError && (
          <div className="px-5 pb-4">
            <Alert tone="error">{revoke.error.message}</Alert>
          </div>
        )}
      </CardBody>
    </Card>
  )
}

export function TeamPage() {
  const { can } = useActiveBusiness()
  const [inviting, setInviting] = useState(false)
  const [editing, setEditing] = useState<Membership | null>(null)

  return (
    <RequirePermission codes={['member.view']}>
      <PageHeader
        title="Team"
        description="Invite staff and control what each person can do in this business."
        action={
          can('member.invite') && (
            <Button icon={<MailPlus className="size-4" />} onClick={() => setInviting(true)}>
              Invite member
            </Button>
          )
        }
      />
      <div className="space-y-6">
        <MembersCard onEdit={setEditing} />
        <InvitationsCard />
      </div>
      <InviteModal open={inviting} onClose={() => setInviting(false)} />
      <EditMemberModal member={editing} onClose={() => setEditing(null)} />
    </RequirePermission>
  )
}
