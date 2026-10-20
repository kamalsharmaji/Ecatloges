import { Bell, CheckCheck } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMarkAllRead, useNotificationAction, useNotifications, useNotificationSummary } from '@/api/workspace'
import { Spinner } from '@/components/ui/Feedback'
import { NotificationIcon } from '@/features/workspace/Bits'
import { relativeTime } from '@/features/workspace/format'
import type { AppNotification } from '@/types/workspace'
import { cn } from '@/utils/cn'

/**
 * Header bell with unread badge and the latest notifications.
 * `context` = active business id, or 'platform' in the Super Admin panel.
 */
export function NotificationBell({ context, viewAllHref }: { context: string | null; viewAllHref?: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const summary = useNotificationSummary(context)
  const latest = useNotifications(context, { page_size: 6 }, open)
  const action = useNotificationAction()
  const markAll = useMarkAllRead(context)
  const unread = summary.data?.unread ?? 0

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

  const openNotification = (n: AppNotification) => {
    if (!n.is_read) action.mutate({ id: n.id, action: 'read' })
    setOpen(false)
    if (n.link) navigate(n.link)
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        className="relative rounded-lg p-2 text-ink hover:bg-white/70"
      >
        <Bell className="size-6" strokeWidth={1.8} aria-hidden />
        {unread > 0 && (
          <span className="absolute top-0.5 right-0.5 min-w-[18px] rounded-full bg-red-600 px-1 text-center text-[10px] leading-[18px] font-semibold text-white ring-2 ring-canvas">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div role="dialog" aria-label="Notifications" className="absolute right-0 z-30 mt-2 w-[22rem] max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <p className="font-semibold">Notifications</p>
            <button
              type="button"
              disabled={!unread || markAll.isPending}
              onClick={() => markAll.mutate(undefined)}
              className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline disabled:text-muted disabled:no-underline"
            >
              <CheckCheck className="size-3.5" aria-hidden /> Mark all as read
            </button>
          </div>
          {latest.isPending ? (
            <Spinner />
          ) : latest.isError ? (
            <p className="px-4 py-6 text-center text-sm text-red-600">Couldn’t load notifications.</p>
          ) : latest.data.results.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted">You’re all caught up.</p>
          ) : (
            <ul className="max-h-96 divide-y divide-border overflow-y-auto">
              {latest.data.results.map((n) => (
                <li key={n.id}>
                  <button type="button" onClick={() => openNotification(n)} className={cn('flex w-full gap-3 px-4 py-3 text-left hover:bg-canvas', !n.is_read && 'bg-brand-50/40')}>
                    <NotificationIcon category={n.category} className="size-9" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className={cn('truncate text-sm', n.is_read ? 'font-medium' : 'font-semibold')}>{n.title}</span>
                        {!n.is_read && <span className="size-2 shrink-0 rounded-full bg-brand-600" aria-label="Unread" />}
                      </span>
                      {n.body && <span className="line-clamp-2 text-xs text-muted">{n.body}</span>}
                      <span className="text-[11px] text-muted">{relativeTime(n.created_at)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {viewAllHref && (
            <Link to={viewAllHref} onClick={() => setOpen(false)} className="block border-t border-border px-4 py-2.5 text-center text-sm font-medium text-brand-700 hover:bg-canvas">
              View all notifications
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
