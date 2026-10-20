import { Copy, Download, ExternalLink, MessageCircle } from 'lucide-react'
import { useState } from 'react'
import { buttonClasses } from '@/components/ui/buttonStyles'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Feedback'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/toast'
import { useActiveBusiness } from '@/features/business/BusinessContext'
import { downloadQr } from '@/api/leads'
import { QrImage } from '@/features/leads/QrImage'
import type { Catalogue } from '@/types/content'

export function ShareCatalogueModal({ catalogue, onClose }: { catalogue: Catalogue | null; onClose: () => void }) {
  const { can } = useActiveBusiness()
  const toast = useToast()
  const [copied, setCopied] = useState(false)
  if (!catalogue) return null
  const published = catalogue.status === 'published'
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(`${catalogue.name} — ${catalogue.public_url}`)}`
  const canQr = can('qrcode.view')

  return (
    <Modal open onClose={onClose} title={`Share “${catalogue.name}”`} description="Anyone with the link can view the published catalogue.">
      <div className="space-y-4">
        {!published && (
          <Alert tone="warning">This catalogue is not published yet. Visitors will see “not found” until you publish it.</Alert>
        )}
        {published && canQr && (
          <div className="flex items-center gap-4 rounded-xl border border-border p-3">
            <QrImage catalogueId={catalogue.id} alt={`QR code for ${catalogue.name}`} className="size-28 shrink-0 rounded-md" />
            <div className="space-y-2">
              <p className="text-sm text-muted">Scan to open the catalogue.</p>
              <Button size="sm" variant="secondary" icon={<Download className="size-4" />}
                onClick={() => downloadQr(catalogue.id, catalogue.slug, 'png').catch(() => toast.show('Could not download the QR code.', 'error'))}>
                Download QR
              </Button>
            </div>
          </div>
        )}
        <div className="flex gap-2">
          <input readOnly value={catalogue.public_url} aria-label="Public link" onFocus={(e) => e.target.select()}
            className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-canvas px-3 text-sm" />
          <Button variant="secondary" icon={<Copy className="size-4" />}
            onClick={async () => { await navigator.clipboard?.writeText(catalogue.public_url); setCopied(true); setTimeout(() => setCopied(false), 2000) }}>
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={whatsapp} target="_blank" rel="noreferrer" className={buttonClasses('secondary', 'md')}>
            <MessageCircle className="size-4 text-emerald-600" aria-hidden /> Share on WhatsApp
          </a>
          {published && (
            <a href={catalogue.public_url} target="_blank" rel="noreferrer" className={buttonClasses('secondary', 'md')}>
              <ExternalLink className="size-4" aria-hidden /> Open catalogue
            </a>
          )}
        </div>
      </div>
    </Modal>
  )
}
