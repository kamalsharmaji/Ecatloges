import { CircleCheck, History, KeyRound, ShieldCheck, UserRound } from 'lucide-react'
import { Link } from 'react-router-dom'
import { CheckDot, PageHero } from '@/components/panel/PageHero'
import { buttonClasses } from '@/components/ui/buttonStyles'
import { Card, CardBody } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Feedback'
import { useAuth } from '@/features/auth/AuthContext'
import { PasswordForm, ProfileForm } from '@/pages/app/AccountPage'
import { dayMonthYear } from '@/utils/dates'

// Readable names for the platform permissions this account actually holds (codes come from the API).
const PERMISSION_LABELS: Record<string, string> = {
  'platform.dashboard.view': 'View platform dashboard',
  'platform.business.view': 'View businesses',
  'platform.business.manage': 'Suspend & reactivate businesses',
  'platform.user.view': 'View users & roles',
  'platform.user.manage': 'Manage users & roles',
  'platform.subscription.view': 'View subscriptions',
  'platform.subscription.manage': 'Manage subscriptions',
  'platform.payment.view': 'View payments',
  'platform.payment.reconcile': 'Reconcile payments',
  'platform.invoice.view': 'View invoices',
  'platform.plan.view': 'View plans & pricing',
  'platform.plan.manage': 'Manage plans & pricing',
  'platform.catalogue.view': 'View catalogues',
  'platform.catalogue.manage': 'Take down catalogues',
  'platform.support.view': 'View support tickets',
  'platform.support.manage': 'Manage support tickets',
  'platform.announcement.manage': 'Manage announcements',
  'platform.email_template.manage': 'Manage email templates',
  'platform.audit_log.view': 'View audit logs',
  'platform.system.view': 'View system settings',
}

function SectionTitle({ icon: Icon, title, action }: { icon: typeof UserRound; title: string; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-2.5 text-[18px] font-bold text-ink"><Icon className="size-6 text-brand-700" aria-hidden /> {title}</h2>
      {action}
    </div>
  )
}

/** The signed-in admin's own profile and password (same account as the business panel). */
export function AdminProfilePage() {
  const { user } = useAuth()
  if (!user) return null
  const role = user.platform_role === 'super_admin' ? 'Super Admin' : user.platform_role === 'support_admin' ? 'Support Admin' : 'None'
  const initials = user.full_name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('') || '?'
  return (
    <>
      <PageHero icon={ShieldCheck} title="Admin Profile & Security" description="Manage your profile, password and see your platform access."
        action={user.platform_permissions.includes('platform.audit_log.view') && (
          <Link to="/admin/audit-logs" className={buttonClasses('secondary', 'lg')}><History className="size-5" aria-hidden /> View Activity Logs</Link>
        )} />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <Card>
          <CardBody className="pt-5">
            <SectionTitle icon={UserRound} title="Profile Information" />
            <div className="grid gap-6 lg:grid-cols-[150px_minmax(0,1fr)]">
              <div className="flex justify-center">
                <span className="flex size-[124px] items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-800 text-4xl font-bold text-white shadow-lg ring-4 ring-white">{initials}</span>
              </div>
              <div className="space-y-4">
                <dl className="grid grid-cols-[110px_1fr] gap-y-2 text-[13.5px]">
                  <dt className="text-body">Email Address</dt><dd className="truncate text-ink">{user.email}</dd>
                  <dt className="text-body">Role</dt><dd><Badge tone="brand">{role}</Badge></dd>
                  <dt className="text-body">Join Date</dt><dd className="text-ink">{dayMonthYear(new Date(user.date_joined))}</dd>
                  <dt className="text-body">Status</dt><dd><Badge tone="success"><CircleCheck className="mr-1 size-3.5" aria-hidden />Active</Badge></dd>
                </dl>
                <ProfileForm />
              </div>
              <div className="rounded-xl bg-[#f5f9ff] p-4 ring-1 ring-[#e3ecf8] lg:col-span-2">
                <p className="mb-2 text-[14px] font-semibold text-ink">Account Permissions</p>
                <ul className="grid gap-x-6 gap-y-1.5 text-[13px] text-ink sm:grid-cols-2 2xl:grid-cols-3">
                  {user.platform_permissions.map((p) => (
                    <li key={p} className="flex items-center gap-2"><CheckDot className="size-4" /> {PERMISSION_LABELS[p] ?? p.replace('platform.', '')}</li>
                  ))}
                </ul>
              </div>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="pt-5">
            <SectionTitle icon={KeyRound} title="Change Password" />
            <p className="mb-4 text-[13px] text-body">Changing your password signs you out on every other device.</p>
            <PasswordForm />
          </CardBody>
        </Card>
      </div>
      <p className="mt-4 text-xs text-body">Platform roles are assigned by a Super Admin under Users & Roles. Two-factor authentication, active sessions and login history are not available yet.</p>
    </>
  )
}
