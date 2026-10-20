import heroArt from '@/assets/reference/hero-team.webp'
import { zodResolver } from '@hookform/resolvers/zod'
import { Crown, MailPlus, Pencil, Plus, UserCheck, Users, UserX, X } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'
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
import { PageHero } from '@/components/panel/PageHero'
import { StatCard, StatGrid } from '@/components/panel/StatCard'
import { FilterSelect, SearchInput, Toolbar } from '@/components/panel/Toolbar'
import { Button } from '@/components/ui/Button'
import { chipTone, rowIconButton } from '@/components/ui/buttonStyles'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Alert, Badge, ErrorState, Spinner } from '@/components/ui/Feedback'
import { SelectField, TextField } from '@/components/ui/Field'
import { ConfirmDialog, Modal } from '@/components/ui/Modal'
import { Pagination } from '@/components/ui/Pagination'
import { useActiveBusiness } from '@/features/business/BusinessContext'
import { Avatar } from '@/features/leads/LeadBits'
import { assignableRoles } from '@/features/team/roleOptions'
import { RequirePermission } from '@/routes/guards'
import type { Membership } from '@/types/api'
import { cn } from '@/utils/cn'
import { dayMonthYear } from '@/utils/dates'
import { applyApiErrors, errorMessage } from '@/utils/formErrors'

const dateFmt = { format: dayMonthYear }

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
  const [status, setStatus] = useState('')
  const [role, setRole] = useState('')
  const roles = useRoles(businessId)
  const members = useMembers(businessId, { page, search: search || undefined, status: status || undefined, role: role || undefined })
  const canManage = can('member.manage')

  return (
    <>
      <Toolbar>
        <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1) }} placeholder="Search by name or email…" />
        <FilterSelect label="Role" value={role} onChange={(v) => { setRole(v); setPage(1) }}
          options={[{ value: '', label: 'All Roles' }, ...(roles.data ?? []).map((r) => ({ value: r.id, label: r.name }))]} />
        <FilterSelect label="Status" value={status} onChange={(v) => { setStatus(v); setPage(1) }}
          options={[{ value: '', label: 'All Status' }, { value: 'active', label: 'Active' }, { value: 'suspended', label: 'Suspended' }]} />
      </Toolbar>
    <Card>
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
              <thead className="bg-thead text-[13px] font-semibold text-ink">
                <tr>
                  <th scope="col" className="w-12 px-5 py-3">#</th>
                  <th scope="col" className="px-3 py-3">Name</th>
                  <th scope="col" className="px-3 py-3">Role</th>
                  <th scope="col" className="hidden px-3 py-3 lg:table-cell">Email / Contact</th>
                  <th scope="col" className="px-3 py-3">Status</th>
                  <th scope="col" className="hidden px-3 py-3 md:table-cell">Joined Date</th>
                  <th scope="col" className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {members.data.results.map((m, i) => {
                  const isMe = m.id === context?.membership_id
                  const editable = canManage && !isMe && (!m.is_owner || context?.is_owner)
                  return (
                    <tr key={m.id}>
                      <td className="px-5 py-3 text-ink">{(members.data.page - 1) * members.data.page_size + i + 1}</td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar name={m.user.full_name || m.user.email} />
                          <p className="font-semibold text-ink">
                            {m.user.full_name} {isMe && <span className="text-xs font-normal text-body">(you)</span>}
                          </p>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <span className={cn('rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap', m.is_owner ? 'bg-[#ffe1e8] text-[#e11d48]' : chipTone(m.role.name))}>{m.role.name}</span>
                      </td>
                      <td className="hidden px-3 py-3 text-[13px] text-ink lg:table-cell">
                        {m.user.email}
                        {m.user.phone && <span className="block">{m.user.phone}</span>}
                      </td>
                      <td className="px-3 py-3">
                        <Badge tone={m.status === 'active' ? 'success' : 'danger'}>
                          {m.status === 'active' ? 'Active' : 'Suspended'}
                        </Badge>
                      </td>
                      <td className="hidden px-3 py-3 text-[13px] text-ink md:table-cell">{dateFmt.format(new Date(m.created_at))}</td>
                      <td className="px-5 py-3">
                        <div className="flex justify-end">
                          {editable && (
                            <button type="button" className={rowIconButton} aria-label={`Manage ${m.user.full_name}`} title="Manage" onClick={() => onEdit(m)}>
                              <Pencil className="size-4" fill="currentColor" fillOpacity={0.2} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardBody>
    </Card>
      {members.data && (
        <Pagination page={page} totalPages={members.data.total_pages} count={members.data.count} pageSize={members.data.page_size} noun="members" onPage={setPage} />
      )}
    </>
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

/** Real counts from the members / invitations endpoints (page_size=1 reads only the totals). */
function TeamStats() {
  const { businessId } = useActiveBusiness()
  const total = useMembers(businessId, { page_size: 1 })
  const active = useMembers(businessId, { page_size: 1, status: 'active' })
  const suspended = useMembers(businessId, { page_size: 1, status: 'suspended' })
  const invitations = useInvitations(businessId)
  return (
    <StatGrid>
      <StatCard icon={Users} label="Total Members" value={total.data?.count ?? '—'} loading={total.isPending} />
      <StatCard icon={UserCheck} tone="pink" label="Active Members" value={active.data?.count ?? '—'} loading={active.isPending} />
      <StatCard icon={MailPlus} tone="amber" label="Pending Invitations" value={invitations.data?.count ?? '—'} loading={invitations.isPending} />
      <StatCard icon={UserX} tone="violet" label="Suspended Members" value={suspended.data?.count ?? '—'} loading={suspended.isPending} />
    </StatGrid>
  )
}

export function TeamPage() {
  const { can } = useActiveBusiness()
  const [inviting, setInviting] = useState(false)
  const [editing, setEditing] = useState<Membership | null>(null)

  return (
    <RequirePermission codes={['member.view']}>
      <PageHero
        icon={Users}
        title="Team Members"
        description="Manage your team members, roles and permissions. Add staff, assign roles and control access to catalogues, products and settings."
        illustration={heroArt}
        highlights={['Add and manage team members', 'Assign roles and permissions', 'Control access by module', 'Track activity in the log']}
        action={
          can('member.invite') && (
            <Button size="lg" icon={<Plus className="size-5" />} onClick={() => setInviting(true)}>
              Add Team Member
            </Button>
          )
        }
      />
      <TeamStats />
      <div className="space-y-4">
        {can('role.view') && (
          <p className="text-right text-sm">
            <Link to="/app/roles" className="font-medium text-brand-700 hover:underline">Roles & permissions →</Link>
          </p>
        )}
        <MembersCard onEdit={setEditing} />
        <InvitationsCard />
      </div>
      <InviteModal open={inviting} onClose={() => setInviting(false)} />
      <EditMemberModal member={editing} onClose={() => setEditing(null)} />
    </RequirePermission>
  )
}
