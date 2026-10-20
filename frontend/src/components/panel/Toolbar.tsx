import { ChevronDown, LayoutGrid, List, Search } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { cn } from '@/utils/cn'

/** Filter row from the UI reference: unboxed, 40 px controls, extra actions pushed to the right. */
export function Toolbar({ children, end }: { children: ReactNode; end?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      {children}
      {end && <div className="ml-auto flex items-center gap-2">{end}</div>}
    </div>
  )
}

/** Debounced search box (300 ms) so typing doesn't fire a request per keystroke. */
export function SearchInput({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  className?: string
}) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  useEffect(() => {
    if (draft === value) return
    const t = setTimeout(() => onChange(draft), 300)
    return () => clearTimeout(t)
  }, [draft, value, onChange])
  return (
    <label className={cn('relative block w-full sm:w-[320px]', className)}>
      <span className="sr-only">{placeholder}</span>
      <Search className="pointer-events-none absolute top-1/2 left-3.5 size-[18px] -translate-y-1/2 text-ink/75" aria-hidden />
      <input
        type="search"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-lg border border-[#d5e5fa] bg-[#eaf4fe] pr-3 pl-10 text-sm text-ink placeholder:text-muted focus:border-brand-600 focus:bg-white focus:ring-2 focus:ring-brand-600/20 focus:outline-none"
      />
    </label>
  )
}

export function FilterSelect({
  label,
  value,
  onChange,
  options,
  className,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
  className?: string
}) {
  return (
    <span className={cn('relative inline-block max-w-[175px]', className)}>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full max-w-[175px] min-w-[140px] appearance-none truncate rounded-lg border border-[#d5e5fa] bg-white pr-9 pl-3.5 text-sm text-ink focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20 focus:outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-ink" aria-hidden />
    </span>
  )
}

export type ViewMode = 'grid' | 'list'

export function ViewToggle({ value, onChange }: { value: ViewMode; onChange: (v: ViewMode) => void }) {
  return (
    <div role="radiogroup" aria-label="View" className="inline-flex gap-1.5">
      {(
        [
          ['grid', LayoutGrid, 'Grid view'],
          ['list', List, 'List view'],
        ] as const
      ).map(([mode, Icon, label]) => (
        <button
          key={mode}
          type="button"
          role="radio"
          aria-checked={value === mode}
          aria-label={label}
          onClick={() => onChange(mode)}
          className={cn(
            'flex size-10 items-center justify-center rounded-lg',
            value === mode ? 'bg-brand-700 text-white shadow-pill' : 'border border-[#d5e5fa] bg-white text-ink hover:bg-brand-50',
          )}
        >
          <Icon className="size-[18px]" />
        </button>
      ))}
    </div>
  )
}
