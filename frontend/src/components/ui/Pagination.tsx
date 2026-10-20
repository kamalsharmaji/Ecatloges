import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/utils/cn'

/** Page numbers to show: first five (or a window around the current page), an ellipsis and the last page. */
function pageList(page: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const start = Math.max(1, Math.min(page - 2, total - 5))
  const window = Array.from({ length: 5 }, (_, i) => start + i)
  const out: (number | '…')[] = []
  if (window[0]! > 1) out.push(1, ...(window[0]! > 2 ? (['…'] as const) : []))
  out.push(...window)
  if (window[4]! < total) out.push(...(window[4]! < total - 1 ? (['…'] as const) : []), total)
  return out
}

/**
 * Reference pagination: square numbered buttons with the active page in solid blue.
 * Pass `pageSize` and `noun` to also print "Showing 1 to 10 of 24 invoices" on the left.
 */
export function Pagination({
  page,
  totalPages,
  count,
  onPage,
  pageSize,
  noun,
}: {
  page: number
  totalPages: number
  count: number
  onPage: (page: number) => void
  pageSize?: number
  noun?: string
}) {
  if (count === 0 || totalPages < 1) return null
  const box = 'flex size-9 items-center justify-center rounded-lg text-sm font-medium'
  const nav = (
    <nav aria-label="Pagination" className="ml-auto flex items-center gap-1.5">
      <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page"
        className={cn(box, 'border border-[#d5e5fa] bg-white text-ink hover:bg-brand-50 disabled:text-slate-300 disabled:hover:bg-white')}>
        <ChevronLeft className="size-4" />
      </button>
      {pageList(page, totalPages).map((p, i) =>
        p === '…' ? (
          <span key={`gap-${i}`} className={cn(box, 'text-muted')} aria-hidden>…</span>
        ) : (
          <button key={p} type="button" onClick={() => onPage(p)} aria-current={p === page ? 'page' : undefined} aria-label={`Page ${p}`}
            className={cn(box, p === page ? 'bg-brand-700 text-white shadow-pill' : 'border border-[#d5e5fa] bg-white text-ink hover:bg-brand-50')}>
            {p}
          </button>
        ),
      )}
      <button type="button" disabled={page >= totalPages} onClick={() => onPage(page + 1)} aria-label="Next page"
        className={cn(box, 'border border-[#d5e5fa] bg-white text-ink hover:bg-brand-50 disabled:text-slate-300 disabled:hover:bg-white')}>
        <ChevronRight className="size-4" />
      </button>
    </nav>
  )
  if (!pageSize || !noun) return nav
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-1 pt-4 text-sm text-ink">
      <span>
        Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, count)} of {count} {noun}
      </span>
      {nav}
    </div>
  )
}
