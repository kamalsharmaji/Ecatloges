import { ArrowLeftRight, LayoutDashboard, Menu, ShieldCheck, Store, UserRound, Users, X, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { Logo } from '@/components/Logo'
import { UserMenu } from '@/components/UserMenu'
import { VerifyEmailBanner } from '@/components/VerifyEmailBanner'
import { useActiveBusiness } from '@/features/business/BusinessContext'
import { cn } from '@/utils/cn'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  /** Hide the link when the user lacks these permissions (UI only; the API enforces access). */
  requires?: string[]
  end?: boolean
}

// Catalogue, product, enquiry and other modules are added to this list as their phases land.
const NAV: NavItem[] = [
  { to: '/app', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/app/business', label: 'Business profile', icon: Store, requires: ['business.view'] },
  { to: '/app/team', label: 'Team', icon: Users, requires: ['member.view'] },
  { to: '/app/roles', label: 'Roles & permissions', icon: ShieldCheck, requires: ['role.view'] },
  { to: '/app/account', label: 'My account', icon: UserRound },
]

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { context, can } = useActiveBusiness()
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center px-5">
        <Link to="/app" onClick={onNavigate}>
          <Logo />
        </Link>
      </div>
      <div className="mx-3 mb-4 rounded-lg border border-border bg-canvas px-3 py-2.5">
        <p className="text-xs text-muted">Business</p>
        <p className="truncate text-sm font-semibold">{context?.business.name}</p>
        <p className="text-xs text-brand-700">{context?.role.name}</p>
      </div>
      <nav aria-label="Main" className="flex-1 space-y-0.5 px-3">
        {NAV.filter((item) => !item.requires || can(...item.requires)).map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive ? 'bg-brand-50 text-brand-800' : 'text-slate-600 hover:bg-canvas hover:text-ink',
              )
            }
          >
            <Icon className="size-4.5" aria-hidden />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-border p-3">
        <Link
          to="/businesses"
          onClick={onNavigate}
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-canvas"
        >
          <ArrowLeftRight className="size-4.5" aria-hidden /> Switch business
        </Link>
      </div>
    </div>
  )
}

export function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false)
  return (
    <div className="min-h-screen lg:pl-64">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-border bg-white lg:block">
        <Sidebar />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-white shadow-xl">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="absolute top-4 right-3 rounded p-1.5 text-muted hover:bg-canvas"
              aria-label="Close navigation"
            >
              <X className="size-5" />
            </button>
            <Sidebar onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-border bg-white/90 px-4 backdrop-blur sm:px-6">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="rounded-lg p-2 text-muted hover:bg-canvas lg:hidden"
          aria-label="Open navigation"
        >
          <Menu className="size-5" />
        </button>
        <div className="flex-1" />
        <UserMenu accountPath="/app/account" />
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 lg:py-8">
        <VerifyEmailBanner />
        <div>
          <Outlet />
        </div>
      </main>
    </div>
  )
}
