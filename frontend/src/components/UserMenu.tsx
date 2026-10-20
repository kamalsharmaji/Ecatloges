import { ArrowLeftRight, ChevronDown, LogOut, ShieldCheck, UserRound } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthContext'

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('')
}

/** Header user block from the UI reference: avatar, name, role subtitle and a chevron menu. */
export function UserMenu({
  accountPath,
  subtitle,
  switchBusiness = false,
  switchLabel = 'Switch business',
  adminLink = true,
}: {
  accountPath?: string
  subtitle?: string
  switchBusiness?: boolean
  switchLabel?: string
  adminLink?: boolean
}) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!user) return null
  const item = 'mt-1 flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink hover:bg-canvas'

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-3 rounded-xl py-1 pr-1 pl-1 hover:bg-white/70"
      >
        <span className="flex size-11 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-800 text-sm font-semibold text-white shadow-sm">
          {initials(user.full_name) || '?'}
        </span>
        <span className="hidden min-w-0 text-left sm:block">
          <span className="block max-w-44 truncate text-[15px] leading-tight font-semibold text-ink">{user.full_name}</span>
          {subtitle && <span className="block max-w-44 truncate text-[13px] leading-tight text-body">{subtitle}</span>}
        </span>
        <ChevronDown className="ml-2 hidden size-5 text-ink sm:block" aria-hidden />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-30 mt-2 w-64 rounded-xl border border-border bg-white p-1.5 shadow-lg">
          <div className="border-b border-border px-3 py-2">
            <p className="truncate text-sm font-medium text-ink">{user.full_name}</p>
            <p className="truncate text-xs text-muted">{user.email}</p>
          </div>
          {adminLink && user.platform_permissions.length > 0 && (
            <Link role="menuitem" to="/admin" onClick={() => setOpen(false)} className={item}>
              <ShieldCheck className="size-4 text-muted" aria-hidden /> Platform admin
            </Link>
          )}
          {accountPath && (
            <Link role="menuitem" to={accountPath} onClick={() => setOpen(false)} className={item}>
              <UserRound className="size-4 text-muted" aria-hidden /> Account settings
            </Link>
          )}
          {switchBusiness && (
            <Link role="menuitem" to="/businesses" onClick={() => setOpen(false)} className={item}>
              <ArrowLeftRight className="size-4 text-muted" aria-hidden /> {switchLabel}
            </Link>
          )}
          <button
            role="menuitem"
            type="button"
            onClick={async () => {
              await logout()
              navigate('/login', { replace: true })
            }}
            className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50"
          >
            <LogOut className="size-4" aria-hidden /> Sign out
          </button>
        </div>
      )}
    </div>
  )
}
