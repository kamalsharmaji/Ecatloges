import { CircleHelp, Crown, Menu, MoreHorizontal, X, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { cn } from '@/utils/cn'

/** Shared chrome for the Business and Super Admin panels, measured from the UI reference. */

export interface ShellNavItem {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
  badge?: number
}

export function SideNav({ items, label, onNavigate, dense = false }: { items: ShellNavItem[]; label: string; onNavigate?: () => void; dense?: boolean }) {
  return (
    <nav aria-label={label} className={cn('px-4', dense ? 'space-y-0.5' : 'space-y-1')}>
      {items.map(({ to, label: text, icon: Icon, end, badge }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3.5 rounded-[10px] px-3.5 text-[15px] font-medium transition-colors',
              dense ? 'h-10' : 'h-11',
              isActive
                ? 'bg-gradient-to-r from-[#2180fc] to-[#0566f5] text-white shadow-pill'
                : 'text-ink hover:bg-white/80',
            )
          }
        >
          <Icon className="size-[22px] shrink-0" strokeWidth={1.7} aria-hidden />
          <span className="truncate">{text}</span>
          {badge ? (
            <span className="ml-auto flex min-w-6 items-center justify-center rounded-full bg-red-600 px-1.5 text-[12px] leading-6 font-medium text-white">
              {badge > 99 ? '99+' : badge}
              <span className="sr-only"> new</span>
            </span>
          ) : null}
        </NavLink>
      ))}
    </nav>
  )
}

/** Bottom-of-sidebar promo card ("Upgrade to Business Plan" / "Platform Management"). */
export function SidebarCard({
  title,
  text,
  points = [],
  action,
  children,
}: {
  title: string
  text?: string
  points?: string[]
  action?: { label: string; to: string; onNavigate?: () => void }
  children?: ReactNode
}) {
  return (
    <div className="mx-4 mb-4 rounded-2xl bg-gradient-to-b from-[#e7f1fe] to-[#e1eefd] px-4 pt-4 pb-4 shadow-[0_1px_0_rgb(255_255_255/0.8)_inset]">
      <span className="mx-auto flex size-11 items-center justify-center rounded-full bg-white text-amber-500 shadow-sm">
        <Crown className="size-6 fill-amber-400" strokeWidth={1.8} aria-hidden />
      </span>
      <p className="mt-2 text-center text-[17px] leading-snug font-bold text-ink">{title}</p>
      {text && <p className="mt-0.5 text-center text-[13px] leading-snug text-body">{text}</p>}
      {points.length > 0 && (
        <ul className="mt-2 space-y-1">
          {points.map((p) => (
            <li key={p} className="flex items-center gap-2 text-[13.5px] text-ink">
              <svg viewBox="0 0 16 16" className="size-4 shrink-0 text-brand-700" aria-hidden>
                <path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {p}
            </li>
          ))}
        </ul>
      )}
      {children}
      {action && (
        <Link
          to={action.to}
          onClick={action.onNavigate}
          className="mt-3 flex h-11 items-center justify-center gap-2 rounded-[10px] bg-gradient-to-r from-[#1f78fe] to-[#0558e6] text-[15px] font-medium text-white shadow-pill hover:brightness-105"
        >
          {action.label}
          <svg viewBox="0 0 20 20" className="size-5" aria-hidden>
            <path d="M4 10h11m-4-4 4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
      )}
    </div>
  )
}

/** Bottom tab bar from the reference mobile dashboard (small screens only); "More" opens the drawer. */
export function MobileTabBar({ items, onMore }: { items: ShellNavItem[]; onMore: () => void }) {
  return (
    <nav aria-label="Quick navigation" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-[#e3ecf8] bg-white pb-[env(safe-area-inset-bottom)] lg:hidden">
      {items.slice(0, 4).map(({ to, label, icon: Icon, end }) => (
        <NavLink key={to} to={to} end={end}
          className={({ isActive }) => cn('flex h-16 flex-col items-center justify-center gap-1 text-[11.5px] font-medium', isActive ? 'text-brand-700' : 'text-body')}>
          <Icon className="size-[22px]" strokeWidth={1.8} aria-hidden />
          {label}
        </NavLink>
      ))}
      <button type="button" onClick={onMore} className="flex h-16 flex-col items-center justify-center gap-1 text-[11.5px] font-medium text-body">
        <MoreHorizontal className="size-[22px]" aria-hidden />
        More
      </button>
    </nav>
  )
}

/** Fixed desktop sidebar + slide-in mobile drawer. */
export function ShellFrame({
  sidebar,
  header,
  children,
  mobileOpen,
  onCloseMobile,
  collapsed,
  tabBar,
}: {
  sidebar: (onNavigate?: () => void) => ReactNode
  header: ReactNode
  children: ReactNode
  mobileOpen: boolean
  onCloseMobile: () => void
  collapsed: boolean
  tabBar?: ReactNode
}) {
  return (
    <div className={cn('min-h-screen bg-canvas', !collapsed && 'lg:pl-[236px]')}>
      {!collapsed && (
        <aside className="fixed inset-y-0 left-0 hidden w-[236px] overflow-y-auto bg-sidebar lg:block">{sidebar()}</aside>
      )}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-slate-900/40" onClick={onCloseMobile} />
          <aside className="absolute inset-y-0 left-0 w-[260px] max-w-[85vw] overflow-y-auto bg-sidebar shadow-xl">
            <button
              type="button"
              onClick={onCloseMobile}
              className="absolute top-4 right-3 z-10 rounded p-1.5 text-muted hover:bg-white"
              aria-label="Close navigation"
            >
              <X className="size-5" />
            </button>
            {sidebar(onCloseMobile)}
          </aside>
        </div>
      )}
      {header}
      <main className={cn('space-y-4 px-3 pt-1 pb-6 sm:px-4', tabBar && 'max-lg:pb-24')}>{children}</main>
      {tabBar}
    </div>
  )
}

export function ShellHeader({
  onMenu,
  search,
  brand,
  children,
}: {
  onMenu: () => void
  search?: ReactNode
  /** Logo shown next to the menu button on small screens, where the sidebar is hidden (reference mobile header). */
  brand?: ReactNode
  children: ReactNode
}) {
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 bg-canvas/95 px-3 backdrop-blur sm:px-4">
      <button
        type="button"
        onClick={onMenu}
        className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-tint text-ink hover:bg-brand-100"
        aria-label="Toggle navigation"
      >
        <Menu className="size-5" />
      </button>
      {brand && <div className="min-w-0 lg:hidden [&_span]:text-[18px] [&_svg]:size-7">{brand}</div>}
      {search}
      <div className="ml-auto flex items-center gap-1.5 sm:gap-3">{children}</div>
    </header>
  )
}

export function HelpLink({ to }: { to: string }) {
  return (
    <Link to={to} className="hidden rounded-lg p-2 text-ink hover:bg-white/70 sm:block" aria-label="Help & Support" title="Help & Support">
      <CircleHelp className="size-6" strokeWidth={1.8} />
    </Link>
  )
}

export function SidebarLogo({ to, children, onNavigate }: { to: string; children: ReactNode; onNavigate?: () => void }) {
  return (
    <div className="flex h-[76px] items-center px-5">
      <Link to={to} onClick={onNavigate}>
        {children}
      </Link>
    </div>
  )
}
