import {
  BookOpen, Building2, CalendarDays, CreditCard, FileText, LayoutDashboard, LifeBuoy, Mail, Megaphone, QrCode, Settings,
  ShieldCheck, Tags, UserCog, type LucideIcon,
} from 'lucide-react'
import { Link, Outlet } from 'react-router-dom'
import { useAdminTicketSummary } from '@/api/workspace'
import { AnnouncementBanner } from '@/components/AnnouncementBanner'
import { Logo } from '@/components/Logo'
import { NotificationBell } from '@/components/NotificationBell'
import { GlobalSearch, type SearchSource } from '@/components/panel/GlobalSearch'
import { PanelVariantProvider } from '@/components/panel/panelVariant'
import { HelpLink, ShellFrame, ShellHeader, SideNav, SidebarCard } from '@/components/panel/Shell'
import { useShellToggle } from '@/components/panel/useShellToggle'
import { UserMenu } from '@/components/UserMenu'
import { useAuth } from '@/features/auth/AuthContext'

// Order follows the Super Admin sidebar in the UI reference (screens that are not built are left out:
// platform Enquiries, Analytics, Media & Storage, Backup & Recovery).
const NAV: { to: string; label: string; icon: LucideIcon; requires?: string }[] = [
  { to: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard, requires: 'platform.dashboard.view' },
  { to: '/admin/businesses', label: 'Businesses', icon: Building2, requires: 'platform.business.view' },
  { to: '/admin/subscriptions', label: 'Subscriptions', icon: CalendarDays, requires: 'platform.subscription.view' },
  { to: '/admin/payments', label: 'Payments', icon: CreditCard, requires: 'platform.payment.view' },
  { to: '/admin/users', label: 'Users & Roles', icon: UserCog, requires: 'platform.user.view' },
  { to: '/admin/plans', label: 'Plans & Pricing', icon: Tags, requires: 'platform.plan.view' },
  { to: '/admin/catalogues', label: 'Catalogues', icon: BookOpen, requires: 'platform.catalogue.view' },
  { to: '/admin/domains-qr', label: 'Domains & QR', icon: QrCode, requires: 'platform.catalogue.view' },
  { to: '/admin/support', label: 'Support Tickets', icon: LifeBuoy, requires: 'platform.support.view' },
  { to: '/admin/system', label: 'System Settings', icon: Settings, requires: 'platform.system.view' },
  { to: '/admin/announcements', label: 'Announcements', icon: Megaphone, requires: 'platform.announcement.manage' },
  { to: '/admin/email-templates', label: 'Email & Templates', icon: Mail, requires: 'platform.email_template.manage' },
  { to: '/admin/audit-logs', label: 'Audit Logs', icon: FileText, requires: 'platform.audit_log.view' },
  { to: '/admin/profile', label: 'Profile & Security', icon: ShieldCheck },
]

/** Open tickets count for the sidebar badge; only mounted for people who can see tickets. */
function useOpenTickets(enabled: boolean) {
  const summary = useAdminTicketSummary(enabled)
  return summary.data?.statuses.find((s) => s.key === 'open')?.count
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { user } = useAuth()
  const granted = new Set(user?.platform_permissions ?? [])
  const openTickets = useOpenTickets(granted.has('platform.support.view'))
  const items = NAV.filter((n) => !n.requires || granted.has(n.requires)).map((n) => ({
    ...n,
    badge: n.to === '/admin/support' ? openTickets : undefined,
  }))
  return (
    <div className="flex min-h-full flex-col">
      <div className="px-5 pt-3 pb-3">
        <Link to="/admin" onClick={onNavigate} className="inline-flex flex-col items-center">
          <Logo admin />
          <span className="mt-1 rounded-md bg-brand-100/80 px-2.5 py-0.5 text-[13px] font-medium text-brand-800">Super Admin</span>
        </Link>
      </div>
      <SideNav items={items} label="Admin" onNavigate={onNavigate} dense />
      <div className="min-h-6 flex-1" />
      <SidebarCard
        title="Platform Management"
        text="Manage your entire myEcatalogues platform"
        points={['Unlimited businesses', 'Multi-tenant system', 'Plan & billing control', 'Platform analytics']}
        action={granted.has('platform.system.view') ? { label: 'Platform Settings', to: '/admin/system', onNavigate } : undefined}
      />
    </div>
  )
}

const SEARCH_SOURCES: (SearchSource & { requires: string })[] = [
  {
    key: 'businesses', label: 'Businesses', endpoint: '/admin/businesses/', requires: 'platform.business.view',
    toItem: (r) => ({ title: String(r.name), subtitle: [r.owner_name, r.city].filter(Boolean).join(' · '), href: `/admin/businesses?business=${r.id}` }),
  },
  {
    key: 'users', label: 'Users', endpoint: '/admin/users/', requires: 'platform.user.view',
    toItem: (r) => ({ title: String(r.full_name || r.email), subtitle: String(r.email), href: `/admin/users?user=${r.id}` }),
  },
  {
    key: 'catalogues', label: 'Catalogues', endpoint: '/admin/catalogues/', requires: 'platform.catalogue.view',
    toItem: (r) => ({ title: String(r.name), subtitle: String((r.business as { name?: string } | null)?.name ?? ''), href: `/admin/catalogues?catalogue=${r.id}` }),
  },
]

const ROLE_LABEL: Record<string, string> = { super_admin: 'Platform Administrator', support_admin: 'Support Administrator' }

export function AdminLayout() {
  const shell = useShellToggle()
  const { user } = useAuth()
  const granted = new Set(user?.platform_permissions ?? [])
  return (
    <PanelVariantProvider value="admin">
      <ShellFrame
        sidebar={(onNavigate) => <Sidebar onNavigate={onNavigate} />}
        mobileOpen={shell.mobileOpen}
        onCloseMobile={shell.closeMobile}
        collapsed={shell.collapsed}
        header={
          <ShellHeader
            onMenu={shell.toggle}
            brand={<Link to="/admin" aria-label="Dashboard"><Logo admin /></Link>}
            search={
              <GlobalSearch
                scope="platform"
                placeholder="Search businesses, users, catalogues..."
                sources={SEARCH_SOURCES.filter((s) => granted.has(s.requires))}
              />
            }
          >
            {/* Platform alerts (new tickets, replies, assignments) — not tied to a business. */}
            <NotificationBell context="platform" />
            <HelpLink to={granted.has('platform.support.view') ? '/admin/support' : '/admin/profile'} />
            <UserMenu accountPath="/admin/profile" subtitle={ROLE_LABEL[user?.platform_role ?? '']} adminLink={false} switchBusiness switchLabel="Business panel" />
          </ShellHeader>
        }
      >
        <AnnouncementBanner />
        <div><Outlet /></div>
      </ShellFrame>
    </PanelVariantProvider>
  )
}
