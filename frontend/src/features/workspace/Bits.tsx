import {
  BookOpen,
  Box,
  CreditCard,
  Crown,
  Info,
  LifeBuoy,
  Mail,
  Settings,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { Avatar } from '@/features/leads/LeadBits'
import { formatDateTime } from '@/features/leads/leadFormat'
import type { NotificationCategory, TicketMessage, TicketPriority, TicketStatus } from '@/types/workspace'
import { cn } from '@/utils/cn'
import { describeChange, TICKET_PRIORITY, TICKET_STATUS, ticketStatusLabel } from './format'

const CATEGORY_ICON: Record<NotificationCategory, { icon: LucideIcon; tone: string }> = {
  enquiry: { icon: Mail, tone: 'bg-[#e3effd] text-[#085afc]' },
  catalogue: { icon: BookOpen, tone: 'bg-[#efe8fe] text-[#8b2cf5]' },
  product: { icon: Box, tone: 'bg-[#fff0dc] text-[#f08c00]' },
  payment: { icon: CreditCard, tone: 'bg-[#efe8fe] text-[#8b2cf5]' },
  subscription: { icon: Crown, tone: 'bg-[#fde7f1] text-[#e0306f]' },
  team: { icon: Users, tone: 'bg-[#e3f8ec] text-[#16a34a]' },
  support: { icon: LifeBuoy, tone: 'bg-[#fff0dc] text-[#f08c00]' },
  system: { icon: Settings, tone: 'bg-[#eceff5] text-[#55607f]' },
}

function categoryIcon(category: NotificationCategory) {
  return CATEGORY_ICON[category] ?? { icon: Info, tone: 'bg-slate-100 text-slate-600' }
}

export function NotificationIcon({ category, className }: { category: NotificationCategory; className?: string }) {
  const { icon: Icon, tone } = categoryIcon(category)
  return (
    <span className={cn('flex size-11 shrink-0 items-center justify-center rounded-full', tone, className)}>
      <Icon className="size-[22px]" strokeWidth={1.8} aria-hidden />
    </span>
  )
}

export function TicketStatusPill({ status, admin = false }: { status: TicketStatus; admin?: boolean }) {
  return (
    <span className={cn('inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap', TICKET_STATUS[status].className)}>
      {ticketStatusLabel(status, admin)}
    </span>
  )
}

export function PriorityPill({ priority }: { priority: TicketPriority }) {
  return (
    <span className={cn('inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium', TICKET_PRIORITY[priority].className)}>
      {TICKET_PRIORITY[priority].label}
    </span>
  )
}

export function ChangeList({ changes }: { changes: Record<string, { from: unknown; to: unknown }> }) {
  const entries = Object.entries(changes)
  if (!entries.length) return null
  return (
    <ul className="mt-1 space-y-0.5 text-xs text-muted">
      {entries.map(([field, change]) => <li key={field}>{describeChange(field, change)}</li>)}
    </ul>
  )
}

/** Chronological ticket timeline: messages as bubbles, status changes as small event lines. */
export function Conversation({ messages }: { messages: TicketMessage[] }) {
  return (
    <ol className="space-y-4" aria-label="Conversation">
      {messages.map((m) =>
        m.kind === 'event' ? (
          <li key={m.id} className="flex items-center gap-2 text-xs text-muted">
            <span className="h-px flex-1 bg-border" />
            <span>{m.body}{m.is_internal && ' (internal)'} · {formatDateTime(m.created_at)}</span>
            <span className="h-px flex-1 bg-border" />
          </li>
        ) : (
          <li key={m.id} className="flex gap-3">
            <Avatar name={m.author_name} />
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                <span className="font-semibold">{m.is_mine ? 'You' : m.author_name}</span>
                {m.is_internal && <span className="rounded bg-amber-100 px-1.5 text-[11px] font-semibold text-amber-800">Internal note</span>}
                <span className="text-xs text-muted">{formatDateTime(m.created_at)}</span>
              </p>
              <p className={cn(
                'mt-1 rounded-lg px-3 py-2 text-sm whitespace-pre-line break-words',
                m.is_internal ? 'border border-dashed border-amber-300 bg-amber-50' : m.is_staff ? 'bg-brand-50' : 'bg-canvas',
              )}>{m.body}</p>
            </div>
          </li>
        ),
      )}
    </ol>
  )
}
