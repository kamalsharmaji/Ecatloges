import type { CategoryStatus, ContentStatus } from '@/types/content'
import { cn } from '@/utils/cn'

// Pastel pills sampled from the reference (Published green, Draft blue, Inactive/Archived pink-red).
const styles: Record<ContentStatus | CategoryStatus, string> = {
  published: 'bg-[#dcf7e5] text-[#14a04a]',
  draft: 'bg-[#e0ebff] text-[#1f5fe0]',
  archived: 'bg-[#ffe1e8] text-[#e11d48]',
}

const labels: Record<ContentStatus | CategoryStatus, string> = {
  published: 'Published',
  draft: 'Draft',
  archived: 'Archived',
}

export function StatusPill({ status, className }: { status: ContentStatus | CategoryStatus; className?: string }) {
  return (
    <span className={cn('inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium', styles[status], className)}>
      {labels[status]}
    </span>
  )
}
