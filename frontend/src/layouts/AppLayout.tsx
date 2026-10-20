import {
  BarChart3,
  BookOpen,
  Box,
  CalendarDays,
  Contact,
  Folder,
  Images,
  LayoutDashboard,
  MessagesSquare,
  QrCode,
  Receipt,
  Settings,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { useBillingOverview, usePlans } from '@/api/billing'
import { useEnquirySummary } from '@/api/leads'
import { buttonClasses } from '@/components/ui/buttonStyles'
import { Alert } from '@/components/ui/Feedback'
import { Logo } from '@/components/Logo'
import { AnnouncementBanner } from '@/components/AnnouncementBanner'
import { NotificationBell } from '@/components/NotificationBell'
import { GlobalSearch, type SearchSource } from '@/components/panel/GlobalSearch'
import { HelpLink, MobileTabBar, ShellFrame, ShellHeader, SideNav, SidebarCard, SidebarLogo } from '@/components/panel/Shell'
import { useShellToggle } from '@/components/panel/useShellToggle'
import { UserMenu } from '@/components/UserMenu'
import { VerifyEmailBanner } from '@/components/VerifyEmailBanner'
import { useActiveBusiness } from '@/features/business/BusinessContext'
import type { Plan } from '@/types/billing'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  /** Hide the link when the user lacks these permissions (UI only; the API enforces access). */
  requires?: string[]
  end?: boolean
}

// Exactly the 13 items of the reference sidebar, in its order. Notifications, Activity Log, Roles and
// Help & Support stay reachable from the header bell, the help (?) icon, Team and Settings.
const NAV: NavItem[] = [
  { to: '/app', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/app/catalogues', label: 'Catalogues', icon: BookOpen, requires: ['catalogue.view'] },
  { to: '/app/products', label: 'Products', icon: Box, requires: ['product.view'] },
  { to: '/app/categories', label: 'Categories', icon: Folder, requires: ['category.view'] },
  { to: '/app/media', label: 'Media Library', icon: Images, requires: ['media.view'] },
  { to: '/app/enquiries', label: 'Enquiries', icon: MessagesSquare, requires: ['enquiry.view'] },
  { to: '/app/analytics', label: 'Analytics', icon: BarChart3, requires: ['analytics.view'] },
  { to: '/app/qr-codes', label: 'QR Codes', icon: QrCode, requires: ['qrcode.view'] },
  { to: '/app/customers', label: 'Customers', icon: Contact, requires: ['customer.view'] },
  { to: '/app/team', label: 'Team Members', icon: Users, requires: ['member.view'] },
  { to: '/app/billing', label: 'Subscription', icon: CalendarDays, requires: ['subscription.view'], end: true },
  { to: '/app/billing/invoices', label: 'Invoices', icon: Receipt, requires: ['invoice.view'] },
  { to: '/app/settings', label: 'Settings', icon: Settings },
]

/** Nudges the team towards a plan; paid features are blocked server-side regardless. */
function SubscriptionBanner() {
  const { businessId, can } = useActiveBusiness()
  const overview = useBillingOverview(businessId, can('subscription.view'))
  const { pathname } = useLocation()
  if (!overview.data || overview.data.has_paid_access || pathname.startsWith('/app/billing')) return null
  return (
    <Alert
      tone="info"
      title="No active plan"
      action={
        can('subscription.manage') && (
          <Link to="/app/billing/plans" className={buttonClasses('primary', 'sm')}>
            Choose a plan
          </Link>
        )
      }
    >
      {can('subscription.manage')
        ? 'Choose a plan to unlock catalogues, products and team invitations.'
        : 'Ask the business owner to choose a plan to unlock paid features.'}
    </Alert>
  )
}

/** What the next plan adds over the current one, in the reference's wording (only true statements). */
function upgradePoints(current: Plan | null, next: Plan) {
  // `null` means unlimited, so an unlimited next plan is "more" than any finite current limit.
  const more = (a: number | null, b: number | null) => (b === null ? a !== null : a !== null && b > a)
  const points: string[] = []
  if (!current || more(current.max_catalogues, next.max_catalogues)) points.push('More catalogues')
  if (!current || more(current.max_products, next.max_products)) points.push('More products')
  if (!current || more(current.max_staff, next.max_staff)) points.push('Team members')
  if (!current || more(current.storage_limit_mb, next.storage_limit_mb)) points.push('More storage')
  if (next.analytics_enabled && !current?.analytics_enabled) points.push('Advanced analytics')
  return points.slice(0, 4)
}

/** Sidebar plan card: next plan up from the live subscription and the live plan list. */
function PlanCard({ onNavigate }: { onNavigate?: () => void }) {
  const { businessId, can } = useActiveBusiness()
  const overview = useBillingOverview(businessId, can('subscription.view'))
  const sub = overview.data?.subscription ?? null
  const plans = usePlans(sub?.plan_interval)
  if (!can('subscription.view') || !overview.data || !plans.data) return null
  const currentPlan = plans.data.find((p) => p.id === sub?.plan.id) ?? null
  const rank = currentPlan?.tier_rank ?? -1
  const next = plans.data.filter((p) => p.tier_rank > rank).sort((a, b) => a.tier_rank - b.tier_rank)[0]
  const manage = can('subscription.manage')
  if (!next) {
    if (!sub) return null
    return (
      <SidebarCard
        title={sub.plan_name}
        text="You're on the highest plan."
        action={{ label: 'View Plan', to: '/app/billing', onNavigate }}
      />
    )
  }
  return (
    <SidebarCard
      title={`Upgrade to ${next.name}`}
      points={upgradePoints(currentPlan, next)}
      action={manage ? { label: 'Upgrade Now', to: '/app/billing/plans', onNavigate } : undefined}
    />
  )
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { businessId, can } = useActiveBusiness()
  const enquiries = useEnquirySummary(businessId, can('enquiry.view'))
  const items = NAV.filter((item) => !item.requires || can(...item.requires)).map((item) => ({
    ...item,
    badge: item.to === '/app/enquiries' ? enquiries.data?.new : undefined,
  }))
  return (
    <div className="flex min-h-full flex-col">
      <SidebarLogo to="/app" onNavigate={onNavigate}>
        <Logo />
      </SidebarLogo>
      <SideNav items={items} label="Main" onNavigate={onNavigate} />
      <div className="min-h-6 flex-1" />
      <PlanCard onNavigate={onNavigate} />
    </div>
  )
}

const SEARCH_SOURCES: (SearchSource & { requires: string })[] = [
  {
    key: 'catalogues', label: 'Catalogues', endpoint: '/catalogues/', requires: 'catalogue.view',
    toItem: (r) => ({ title: String(r.name), subtitle: String(r.tagline || ''), href: `/app/catalogues/${r.id}` }),
  },
  {
    key: 'products', label: 'Products', endpoint: '/products/', requires: 'product.view',
    toItem: (r) => ({ title: String(r.name), subtitle: r.sku ? `SKU: ${r.sku}` : undefined, href: `/app/products/${r.id}` }),
  },
  {
    key: 'enquiries', label: 'Enquiries', endpoint: '/enquiries/', requires: 'enquiry.view',
    toItem: (r) => ({ title: String(r.name), subtitle: String(r.product_name || r.catalogue_name || ''), href: `/app/enquiries?enquiry=${r.id}` }),
  },
]

export function AppLayout() {
  const { businessId, context, can } = useActiveBusiness()
  const shell = useShellToggle()
  return (
    <ShellFrame
      sidebar={(onNavigate) => <Sidebar onNavigate={onNavigate} />}
      mobileOpen={shell.mobileOpen}
      onCloseMobile={shell.closeMobile}
      collapsed={shell.collapsed}
      tabBar={
        <MobileTabBar
          onMore={shell.toggle}
          items={NAV.filter((n) => ['/app', '/app/catalogues', '/app/products', '/app/enquiries'].includes(n.to) && (!n.requires || can(...n.requires)))}
        />
      }
      header={
        <ShellHeader
          onMenu={shell.toggle}
          brand={<Link to="/app" aria-label="Dashboard"><Logo /></Link>}
          search={
            <GlobalSearch
              scope={businessId}
              placeholder="Search products, catalogues, enquiries..."
              sources={SEARCH_SOURCES.filter((s) => can(s.requires))}
            />
          }
        >
          <NotificationBell context={businessId} viewAllHref="/app/notifications" />
          <HelpLink to="/app/support" />
          <UserMenu accountPath="/app/account" subtitle={context?.role.name} switchBusiness />
        </ShellHeader>
      }
    >
      <VerifyEmailBanner />
      <SubscriptionBanner />
      <AnnouncementBanner />
      <div>
        <Outlet />
      </div>
    </ShellFrame>
  )
}
