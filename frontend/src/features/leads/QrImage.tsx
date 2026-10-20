import { LoaderCircle, QrCode } from 'lucide-react'
import { useEffect, useState } from 'react'
import { fetchQr } from '@/api/leads'
import { cn } from '@/utils/cn'

/** Authenticated QR preview (the management endpoint needs auth headers, so <img src> can't call it directly). */
export function QrImage({ catalogueId, className, alt }: { catalogueId: string; className?: string; alt: string }) {
  const [state, setState] = useState<{ url?: string; error?: boolean }>({})
  useEffect(() => {
    let url: string | undefined
    let cancelled = false
    fetchQr(catalogueId, { type: 'png', size: 400 })
      .then((r) => {
        url = r.url
        if (cancelled) URL.revokeObjectURL(r.url)
        else setState({ url: r.url })
      })
      .catch(() => !cancelled && setState({ error: true }))
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [catalogueId])

  if (state.url) return <img src={state.url} alt={alt} className={cn('bg-white', className)} />
  return (
    <div className={cn('flex items-center justify-center bg-slate-50 text-slate-400', className)}>
      {state.error ? <QrCode className="size-8" aria-label="QR code unavailable" /> : <LoaderCircle className="size-6 animate-spin" aria-label="Loading QR code" />}
    </div>
  )
}

