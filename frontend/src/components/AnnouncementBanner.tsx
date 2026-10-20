import { Megaphone, X } from 'lucide-react'
import { useState } from 'react'
import { useAnnouncementFeed } from '@/api/settings'
import { cn } from '@/utils/cn'

const KEY = 'mec.dismissedAnnouncements'

function readDismissed(): string[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[]
  } catch {
    return []
  }
}

const TONE: Record<string, string> = {
  info: 'border-brand-200 bg-brand-50 text-brand-900',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  warning: 'border-amber-200 bg-amber-50 text-amber-900',
  error: 'border-red-200 bg-red-50 text-red-900',
}

/** Live platform announcements for the signed-in user. Dismissal is remembered per browser. */
export function AnnouncementBanner() {
  const feed = useAnnouncementFeed()
  const [dismissed, setDismissed] = useState<string[]>(readDismissed)
  const current = (feed.data ?? []).find((a) => !dismissed.includes(a.id))
  if (!current) return null

  const dismiss = () => {
    const next = [...dismissed, current.id].slice(-50)
    setDismissed(next)
    try {
      localStorage.setItem(KEY, JSON.stringify(next))
    } catch {
      // Storage blocked: the banner just reappears on the next visit.
    }
  }

  return (
    <div role="status" className={cn('flex items-start gap-3 rounded-xl border px-4 py-3', TONE[current.level] ?? TONE.info)}>
      <Megaphone className="mt-0.5 size-5 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{current.title}</p>
        <p className="text-sm whitespace-pre-line opacity-90">{current.body}</p>
      </div>
      <button type="button" onClick={dismiss} aria-label="Dismiss announcement" className="rounded p-1 opacity-70 hover:opacity-100">
        <X className="size-4" />
      </button>
    </div>
  )
}
