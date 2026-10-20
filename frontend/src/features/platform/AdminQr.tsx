import { useEffect, useState } from 'react'
import { fetchAdminQr } from '@/api/platform'
import { Spinner } from '@/components/ui/Feedback'

/** QR image loaded through the authenticated admin API (published catalogues only). */
export function AdminQr({ catalogueId, alt, className }: { catalogueId: string; alt: string; className?: string }) {
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let active = true
    let created: string | null = null
    setUrl(null)
    setFailed(false)
    fetchAdminQr(catalogueId, 'svg')
      .then((u) => { created = u; if (active) setUrl(u) })
      .catch(() => active && setFailed(true))
    return () => {
      active = false
      if (created) URL.revokeObjectURL(created)
    }
  }, [catalogueId])
  if (failed) return <p className="text-xs text-red-600">QR unavailable.</p>
  if (!url) return <Spinner />
  return <img src={url} alt={alt} className={className} />
}
