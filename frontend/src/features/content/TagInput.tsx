import { Plus, X } from 'lucide-react'
import { useId, useState } from 'react'

/** Chip-style tag input (Enter or comma adds a tag). */
export function TagInput({ label, value, onChange, max = 20, disabled = false }: { label: string; value: string[]; onChange: (tags: string[]) => void; max?: number; disabled?: boolean }) {
  const id = useId()
  const [draft, setDraft] = useState('')
  const add = () => {
    const tag = draft.trim().replace(/,$/, '')
    if (tag && !value.some((t) => t.toLowerCase() === tag.toLowerCase()) && value.length < max) onChange([...value, tag.slice(0, 30)])
    setDraft('')
  }
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">{label} <span className="font-normal text-muted">(optional)</span></label>
      <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-lg border border-border bg-white px-2 py-1.5 focus-within:border-brand-600 focus-within:ring-2 focus-within:ring-brand-600/20">
        {value.map((tag) => (
          <span key={tag} className="inline-flex items-center gap-1 rounded-md bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-800">
            {tag}
            {!disabled && (
              <button type="button" aria-label={`Remove ${tag}`} onClick={() => onChange(value.filter((t) => t !== tag))}>
                <X className="size-3" />
              </button>
            )}
          </span>
        ))}
        <input
          id={id}
          value={draft}
          disabled={disabled || value.length >= max}
          onChange={(e) => (e.target.value.endsWith(',') ? (setDraft(e.target.value), add()) : setDraft(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            } else if (e.key === 'Backspace' && !draft && value.length) onChange(value.slice(0, -1))
          }}
          onBlur={add}
          placeholder={value.length >= max ? `Max ${max} tags` : 'Add tag'}
          className="min-w-24 flex-1 border-0 bg-transparent p-0.5 text-sm focus:outline-none"
        />
      </div>
    </div>
  )
}

/** Editable list of short bullet points (product highlights). */
export function ListInput({ label, value, onChange, max = 10, disabled = false }: { label: string; value: string[]; onChange: (items: string[]) => void; max?: number; disabled?: boolean }) {
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium">{label} <span className="font-normal text-muted">(key features)</span></p>
      <ul className="space-y-1.5">
        {value.map((item, i) => (
          <li key={i} className="flex gap-2">
            <input
              aria-label={`${label} ${i + 1}`}
              value={item}
              maxLength={120}
              disabled={disabled}
              onChange={(e) => onChange(value.map((v, j) => (j === i ? e.target.value : v)))}
              className="h-9 flex-1 rounded-lg border border-border px-3 text-sm focus:border-brand-600 focus:outline-none"
            />
            {!disabled && (
              <button type="button" aria-label={`Remove ${label} ${i + 1}`} onClick={() => onChange(value.filter((_, j) => j !== i))} className="rounded-lg px-2 text-muted hover:bg-canvas hover:text-red-600">
                <X className="size-4" />
              </button>
            )}
          </li>
        ))}
      </ul>
      {!disabled && value.length < max && (
        <button type="button" onClick={() => onChange([...value, ''])} className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline">
          <Plus className="size-4" aria-hidden /> Add highlight
        </button>
      )}
    </div>
  )
}
