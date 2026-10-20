import { MoreHorizontal, type LucideIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { cn } from '@/utils/cn'

export interface MenuItem {
  label: string
  icon?: LucideIcon
  onSelect: () => void
  danger?: boolean
  hidden?: boolean
  disabled?: boolean
}

/** "⋯" dropdown used on cards and table rows. Items the user can't use should be passed as hidden. */
export function ActionMenu({
  items,
  label = 'More actions',
  className,
  tint = false,
}: {
  items: MenuItem[]
  label?: string
  className?: string
  /** Table-row style: tinted square instead of the white floating button used on images. */
  tint?: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const visible = items.filter((i) => !i.hidden)

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

  if (visible.length === 0) return null
  return (
    <div ref={ref} className={cn(!className?.includes('absolute') && 'relative', className)}>
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation()
          setOpen((o) => !o)
        }}
        className={cn(
          'flex size-8 items-center justify-center rounded-lg',
          tint
            ? 'bg-[#eef4fd] text-ink hover:bg-[#dcebfd]'
            : 'bg-white text-ink shadow-[0_1px_4px_rgb(15_40_100/0.12)] ring-1 ring-[#e3ecf8] hover:bg-brand-50',
        )}
      >
        <MoreHorizontal className="size-[18px]" strokeWidth={2.4} />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-30 mt-1 w-48 rounded-xl border border-border bg-white p-1 shadow-lg">
          {visible.map(({ label: itemLabel, icon: Icon, onSelect, danger, disabled }) => (
            <button
              key={itemLabel}
              type="button"
              role="menuitem"
              disabled={disabled}
              onClick={(e) => {
                e.stopPropagation()
                setOpen(false)
                onSelect()
              }}
              className={cn(
                'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm disabled:opacity-50',
                danger ? 'text-red-600 hover:bg-red-50' : 'hover:bg-canvas',
              )}
            >
              {Icon && <Icon className="size-4" aria-hidden />} {itemLabel}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
