import { CircleCheck, CircleX, MailWarning, ShieldCheck, UserCog, UserRound, Users, X } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAdminUser, useAdminUsers, useAdminUserSummary, useUpdateAdminUser } from '@/api/platform'
import { BarList } from '@/components/charts/BarList'
import { PageHero } from '@/components/panel/PageHero'
import { StatCard } from '@/components/panel/StatCard'
import { FilterSelect, SearchInput, Toolbar } from '@/components/panel/Toolbar'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { EmptyState, ErrorState, Spinner } from '@/components/ui/Feedback'
import { ConfirmDialog } from '@/components/ui/Modal'
import { Pagination } from '@/components/ui/Pagination'
import { useToast } from '@/components/ui/toast'
import { useAuth } from '@/features/auth/AuthContext'
import { Avatar } from '@/features/leads/LeadBits'
import { formatDateTime } from '@/features/leads/leadFormat'
import { actionLabel, relativeTime } from '@/features/workspace/format'
import { RequirePlatformPermission } from '@/routes/guards'
import type { PlatformRole } from '@/types/platform'
import { cn } from '@/utils/cn'

const ROLE: Record<string, { label: string; className: string }> = {
  super_admin: { label: 'Super Admin', className: 'bg-violet-50 text-violet-700' },
  support_admin: { label: 'Support Admin', className: 'bg-brand-50 text-brand-700' },
  '': { label: 'Business user', className: 'bg-slate-100 text-slate-600' },
}

function UserPanel({ id, onClose }: { id: string; onClose: () => void }) {
  const { user: me } = useAuth()
  const toast = useToast()
  const detail = useAdminUser(id)
  const update = useUpdateAdminUser()
  const [pending, setPending] = useState<{ is_active?: boolean; platform_role?: PlatformRole } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const canManage = Boolean(me?.platform_permissions.includes('platform.user.manage'))
  const u = detail.data
  const isSelf = u?.id === me?.id

  return (
    <aside className="rounded-2xl bg-white p-5 shadow-panel" aria-label="User details">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-[17px] font-bold text-ink">User Details</h2>
        <button type="button" onClick={onClose} aria-label="Close details" className="rounded p-1 text-muted hover:bg-canvas"><X className="size-5" /></button>
      </div>
      {detail.isPending ? <Spinner /> : detail.isError ? <ErrorState error={detail.error} onRetry={() => detail.refetch()} /> : u && (
        <div className="space-y-5 text-sm">
          <div className="flex items-center gap-3">
            <Avatar name={u.full_name || u.email} size="lg" />
            <div className="min-w-0">
              <p className="truncate text-base font-bold">{u.full_name}</p>
              <p className="truncate text-muted">{u.email}</p>
              <p className="text-xs text-muted">Joined {formatDateTime(u.date_joined)} · last sign-in {u.last_login ? relativeTime(u.last_login) : 'never'}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className={cn('rounded-md px-2 py-0.5 text-xs font-semibold', ROLE[u.platform_role].className)}>{ROLE[u.platform_role].label}</span>
            <span className={cn('rounded-md px-2 py-0.5 text-xs font-semibold', u.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700')}>{u.is_active ? 'Active' : 'Deactivated'}</span>
            {!u.is_email_verified && <span className="rounded-md bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">Email unverified</span>}
          </div>

          <div>
            <p className="mb-1.5 text-xs font-semibold tracking-wide text-muted uppercase">Business roles</p>
            {u.memberships.length === 0 ? <p className="text-muted">Not a member of any business.</p> : (
              <ul className="divide-y divide-border rounded-lg border border-border">
                {u.memberships.map((m) => (
                  <li key={m.business_id} className="flex items-center justify-between gap-2 px-3 py-2">
                    <Link to={`/admin/businesses?business=${m.business_id}`} className="truncate font-medium hover:text-brand-700">{m.business_name}</Link>
                    <span className="shrink-0 text-xs text-muted">{m.role}{m.status !== 'active' && ` · ${m.status}`}{m.business_status !== 'active' && ' · business suspended'}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-1 text-xs text-muted">Business roles are managed by each business (Team page) and are separate from platform roles.</p>
          </div>

          <div>
            <p className="mb-1.5 text-xs font-semibold tracking-wide text-muted uppercase">Platform permissions</p>
            {u.platform_permissions.length === 0 ? <p className="text-muted">None — this user has no Super Admin panel access.</p> : (
              <ul className="flex flex-wrap gap-1">{u.platform_permissions.map((p) => <li key={p} className="rounded bg-canvas px-1.5 py-0.5 font-mono text-[11px]">{p.replace('platform.', '')}</li>)}</ul>
            )}
          </div>

          {canManage && (
            <div className="space-y-3 border-t border-border pt-4">
              {isSelf ? <p className="text-xs text-muted">You can't change your own platform role or status.</p> : (
                <>
                  <label className="block text-sm font-medium">Platform role
                    <select value={u.platform_role} disabled={update.isPending}
                      onChange={(e) => { setError(null); setPending({ platform_role: e.target.value as PlatformRole }) }}
                      className="mt-1.5 block h-10 w-full rounded-lg border border-border bg-white px-3 text-sm">
                      <option value="">None (business user)</option>
                      <option value="support_admin">Support Admin — support tickets + billing read-only</option>
                      <option value="super_admin">Super Admin — full platform access</option>
                    </select>
                  </label>
                  <Button variant={u.is_active ? 'danger' : 'primary'} className="w-full" icon={u.is_active ? <CircleX className="size-4" /> : <CircleCheck className="size-4" />}
                    onClick={() => { setError(null); setPending({ is_active: !u.is_active }) }}>
                    {u.is_active ? 'Deactivate account' : 'Reactivate account'}
                  </Button>
                  {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
                </>
              )}
            </div>
          )}

          <div>
            <p className="mb-1.5 text-xs font-semibold tracking-wide text-muted uppercase">Recent activity</p>
            {u.activity.length === 0 ? <p className="text-muted">No recorded activity.</p> : (
              <ul className="space-y-1.5">
                {u.activity.slice(0, 8).map((e) => (
                  <li key={e.id} className="flex justify-between gap-2"><span className="truncate">{actionLabel(e.action)} <span className="text-muted">{e.target_label}</span></span><span className="shrink-0 text-xs text-muted">{relativeTime(e.created_at)}</span></li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
      <ConfirmDialog
        open={Boolean(pending)}
        onClose={() => setPending(null)}
        loading={update.isPending}
        tone={pending?.is_active === false || pending?.platform_role === 'super_admin' ? 'danger' : 'primary'}
        title={pending?.is_active === false ? 'Deactivate this account?' : pending?.is_active ? 'Reactivate this account?' : 'Change platform role?'}
        description={pending?.is_active === false
          ? 'They are signed out everywhere and can no longer sign in. Their businesses and data are not changed.'
          : pending?.is_active ? 'They can sign in again.'
            : `New role: ${ROLE[pending?.platform_role ?? ''].label}. This takes effect on their next request.`}
        confirmLabel="Confirm"
        error={error}
        onConfirm={() => pending && update.mutate({ id, ...pending }, {
          onSuccess: () => { toast.show('User updated.'); setPending(null) },
          onError: (e) => { setError(e.message); setPending(null) },
        })}
      />
    </aside>
  )
}

const TABS = [
  { key: '', label: 'All Users', params: {} },
  { key: 'active', label: 'Active', params: { is_active: 'true' } },
  { key: 'inactive', label: 'Deactivated', params: { is_active: 'false' } },
  { key: 'unverified', label: 'Unverified', params: { is_email_verified: 'false' } },
] as const

export function AdminUsersPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const openId = searchParams.get('user')
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('')
  const [params, setParams] = useState({ page: 1, search: '', platform_role: '' })
  const list = useAdminUsers({ ...params, ...TABS.find((t) => t.key === tab)!.params, page_size: 10 })
  const summary = useAdminUserSummary()
  const s = summary.data
  const set = (patch: Partial<typeof params>) => setParams((p) => ({ ...p, page: 1, ...patch }))
  const rows = list.data?.results ?? []

  return (
    <RequirePlatformPermission code="platform.user.view">
      <PageHero icon={UserCog} title="Users & Roles" description="Everyone with an account. Platform roles (Super / Support Admin) are managed here; business roles are managed by each business." />
      <div className="mb-4 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 2xl:grid-cols-5">
        <StatCard icon={Users} label="Total Users" value={s?.total ?? '—'} loading={summary.isPending} hint={s && `+${s.new_this_month} this month`} />
        <StatCard icon={CircleCheck} tone="green" label="Active" value={s?.active ?? '—'} loading={summary.isPending} />
        <StatCard icon={CircleX} tone="pink" label="Deactivated" value={s?.inactive ?? '—'} loading={summary.isPending} />
        <StatCard icon={MailWarning} tone="amber" label="Email Unverified" value={s?.unverified ?? '—'} loading={summary.isPending} />
        <StatCard icon={ShieldCheck} tone="violet" label="Platform Admins" value={s ? s.super_admins + s.support_admins : '—'} loading={summary.isPending} hint={s && `${s.super_admins} super · ${s.support_admins} support`} />
      </div>

      <div className={openId ? 'grid gap-6 2xl:grid-cols-[minmax(0,1fr)_24rem]' : ''}>
        <div className="min-w-0 space-y-6">
          <div>
            <div className="mb-3 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="User filter">
              {TABS.map((t) => (
                <button key={t.key || 'all'} type="button" role="tab" aria-selected={tab === t.key} onClick={() => { setTab(t.key); setParams((p) => ({ ...p, page: 1 })) }}
                  className={cn('h-10 shrink-0 rounded-lg px-4 text-sm font-medium', tab === t.key ? 'bg-brand-700 text-white shadow-pill' : 'bg-white text-ink ring-1 ring-[#d5e5fa] hover:bg-brand-50')}>
                  {t.label}
                </button>
              ))}
            </div>
            <Toolbar>
              <SearchInput value={params.search} onChange={(search) => set({ search })} placeholder="Search by name, email or mobile…" />
              <FilterSelect label="Platform role" value={params.platform_role} onChange={(platform_role) => set({ platform_role })}
                options={[{ value: '', label: 'All roles' }, { value: 'super_admin', label: 'Super Admin' }, { value: 'support_admin', label: 'Support Admin' }]} />
            </Toolbar>
            {list.isPending ? <Spinner /> : list.isError ? <ErrorState error={list.error} onRetry={() => list.refetch()} /> : rows.length === 0 ? (
              <EmptyState icon={UserRound} title="No users match your filters" />
            ) : (
              <div className="overflow-x-auto rounded-2xl bg-white shadow-panel">
                <table className="w-full text-left text-sm">
                  <thead className="bg-thead text-[13px] font-semibold text-ink">
                    <tr>
                      <th scope="col" className="px-4 py-3">Name</th>
                      <th scope="col" className="px-3 py-3">Platform role</th>
                      <th scope="col" className="hidden px-3 py-3 text-right sm:table-cell">Businesses</th>
                      <th scope="col" className="px-3 py-3">Status</th>
                      <th scope="col" className="hidden px-3 py-3 lg:table-cell">Joined</th>
                      <th scope="col" className="hidden px-3 py-3 lg:table-cell">Last sign-in</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {rows.map((u) => (
                      <tr key={u.id} onClick={() => setSearchParams({ user: u.id })} className={cn('cursor-pointer hover:bg-canvas', openId === u.id && 'bg-brand-50/60')}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <Avatar name={u.full_name || u.email} />
                            <div className="min-w-0">
                              <button type="button" onClick={() => setSearchParams({ user: u.id })} className="block max-w-56 truncate text-left font-medium hover:text-brand-700">{u.full_name}</button>
                              <span className="block max-w-56 truncate text-xs text-muted">{u.email}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3"><span className={cn('rounded-md px-2 py-0.5 text-xs font-semibold', ROLE[u.platform_role].className)}>{ROLE[u.platform_role].label}</span></td>
                        <td className="hidden px-3 py-3 text-right tabular-nums sm:table-cell">{u.membership_count}</td>
                        <td className="px-3 py-3"><span className={cn('rounded-md px-2 py-0.5 text-xs font-semibold', u.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700')}>{u.is_active ? 'Active' : 'Inactive'}</span></td>
                        <td className="hidden px-3 py-3 text-xs text-muted lg:table-cell">{formatDateTime(u.date_joined)}</td>
                        <td className="hidden px-3 py-3 text-xs text-muted lg:table-cell">{u.last_login ? formatDateTime(u.last_login) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {list.data && list.data.count > 0 && (
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
                <span>Showing {(list.data.page - 1) * list.data.page_size + 1} to {Math.min(list.data.page * list.data.page_size, list.data.count)} of {list.data.count} users</span>
                <Pagination page={params.page} totalPages={list.data.total_pages} count={list.data.count} onPage={(page) => setParams((p) => ({ ...p, page }))} />
              </div>
            )}
          </div>
          {s && (
            <Card>
              <CardHeader title="Role Distribution" description="Platform roles. New accounts are created by sign-up or business invitations — not from this panel." />
              <CardBody>
                <BarList rows={[
                  { key: 'business', label: 'Business users (no platform role)', value: s.total - s.super_admins - s.support_admins },
                  { key: 'support', label: 'Support Admins', value: s.support_admins },
                  { key: 'super', label: 'Super Admins', value: s.super_admins },
                ]} />
              </CardBody>
            </Card>
          )}
        </div>
        {openId && <div className="2xl:sticky 2xl:top-20 2xl:self-start"><UserPanel id={openId} onClose={() => setSearchParams({})} /></div>}
      </div>
    </RequirePlatformPermission>
  )
}
