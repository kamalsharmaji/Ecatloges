import { CircleAlert, CircleCheck, Info, X } from 'lucide-react'
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { ToastContext, type ToastTone } from '@/components/ui/toast'
import { cn } from '@/utils/cn'

interface Toast {
  id: number
  message: string
  tone: ToastTone
}

const icons = { success: CircleCheck, error: CircleAlert, info: Info }
const tones = {
  success: 'border-emerald-200 text-emerald-900',
  error: 'border-red-200 text-red-800',
  info: 'border-brand-200 text-brand-900',
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const seq = useRef(0)

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), [])
  const show = useCallback(
    (message: string, tone: ToastTone = 'success') => {
      const id = ++seq.current
      setToasts((t) => [...t.slice(-3), { id, message, tone }])
      setTimeout(() => dismiss(id), tone === 'error' ? 7000 : 4000)
    },
    [dismiss],
  )
  const value = useMemo(() => ({ show }), [show])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div aria-live="polite" className="fixed right-4 bottom-4 z-50 flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2">
        {toasts.map((t) => {
          const Icon = icons[t.tone]
          return (
            <div key={t.id} role={t.tone === 'error' ? 'alert' : 'status'} className={cn('flex items-start gap-3 rounded-xl border bg-white px-4 py-3 text-sm shadow-lg', tones[t.tone])}>
              <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
              <p className="flex-1">{t.message}</p>
              <button type="button" onClick={() => dismiss(t.id)} aria-label="Dismiss" className="text-muted hover:text-ink">
                <X className="size-4" />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}
