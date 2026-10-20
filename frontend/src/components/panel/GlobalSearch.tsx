import { useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '@/api/client'
import type { Paginated } from '@/types/api'
import { cn } from '@/utils/cn'

/** One searchable list: an existing list endpoint queried with `?search=`. */
export interface SearchSource {
  key: string
  label: string
  endpoint: string
  toItem: (row: Record<string, unknown>) => { title: string; subtitle?: string; href: string }
}

/**
 * Header search from the UI reference ("Search products, catalogues, enquiries…", Ctrl + K).
 * Queries the panel's own list endpoints, so results respect the same permissions and tenant scoping.
 */
export function GlobalSearch({ sources, placeholder, scope }: { sources: SearchSource[]; placeholder: string; scope: string | null }) {
  const [draft, setDraft] = useState('')
  const [term, setTerm] = useState('')
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    const t = setTimeout(() => setTerm(draft.trim()), 250)
    return () => clearTimeout(t)
  }, [draft])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
        setOpen(true)
      }
    }
    const onDown = (e: MouseEvent) => !boxRef.current?.contains(e.target as Node) && setOpen(false)
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [])

  const results = useQuery({
    queryKey: ['global-search', scope, term, sources.map((s) => s.key)],
    enabled: term.length >= 2 && sources.length > 0,
    staleTime: 30_000,
    queryFn: async () =>
      Promise.all(
        sources.map(async (s) => {
          const { data } = await api.get<Paginated<Record<string, unknown>>>(s.endpoint, { params: { search: term, page_size: 5 } })
          return { source: s, items: data.results.map(s.toItem) }
        }),
      ),
  })

  const go = (href: string) => {
    setOpen(false)
    setDraft('')
    navigate(href)
  }
  const groups = results.data?.filter((g) => g.items.length > 0) ?? []

  return (
    <div ref={boxRef} className="relative hidden w-full max-w-[570px] md:block">
      <label className="relative block">
        <span className="sr-only">{placeholder}</span>
        <Search className="pointer-events-none absolute top-1/2 left-3.5 size-[18px] -translate-y-1/2 text-ink/70" aria-hidden />
        <input
          ref={inputRef}
          type="search"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
          placeholder={placeholder}
          className="h-10 w-full rounded-lg border border-transparent bg-tint pr-20 pl-11 text-sm text-ink placeholder:text-muted focus:border-brand-300 focus:bg-white focus:outline-none"
        />
        <kbd className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 rounded-md bg-white/80 px-1.5 py-0.5 font-sans text-xs font-medium text-ink/80">
          Ctrl + K
        </kbd>
      </label>
      {open && term.length >= 2 && (
        <div role="listbox" aria-label="Search results" className="absolute inset-x-0 top-12 z-40 max-h-[70vh] overflow-y-auto rounded-xl border border-border bg-white p-2 shadow-lg">
          {results.isPending ? (
            <p className="px-3 py-4 text-sm text-muted">Searching…</p>
          ) : results.isError ? (
            <p className="px-3 py-4 text-sm text-red-600">Search is unavailable right now.</p>
          ) : groups.length === 0 ? (
            <p className="px-3 py-4 text-sm text-muted">No matches for “{term}”.</p>
          ) : (
            groups.map(({ source, items }) => (
              <div key={source.key} className="py-1">
                <p className="px-3 py-1 text-xs font-semibold text-muted">{source.label}</p>
                {items.map((item) => (
                  <button
                    key={item.href}
                    type="button"
                    role="option"
                    aria-selected={false}
                    onClick={() => go(item.href)}
                    className={cn('flex w-full flex-col rounded-lg px-3 py-2 text-left hover:bg-brand-50')}
                  >
                    <span className="truncate text-sm font-medium text-ink">{item.title}</span>
                    {item.subtitle && <span className="truncate text-xs text-muted">{item.subtitle}</span>}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
