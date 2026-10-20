import { Copy, Download, ExternalLink, MessageCircle, QrCode, ScanLine } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useCatalogues } from '@/api/content'
import { downloadQr, useAnalytics } from '@/api/leads'
import { PageHero } from '@/components/panel/PageHero'
import { StatusPill } from '@/components/panel/StatusPill'
import { FilterSelect, SearchInput, Toolbar } from '@/components/panel/Toolbar'
import { Button } from '@/components/ui/Button'
import { buttonClasses } from '@/components/ui/buttonStyles'
import { Alert, EmptyState, ErrorState, Spinner } from '@/components/ui/Feedback'
import { Pagination } from '@/components/ui/Pagination'
import { useToast } from '@/components/ui/toast'
import { useActiveBusiness } from '@/features/business/BusinessContext'
import { isPlanError } from '@/features/content/format'
import { presetRange } from '@/features/leads/dateRange'
import { QrImage } from '@/features/leads/QrImage'
import { RequirePermission } from '@/routes/guards'
import type { Catalogue } from '@/types/content'

export function QrCodesPage() {
  const { businessId, can } = useActiveBusiness()
  const toast = useToast()
  const [params, setParams] = useState({ page: 1, search: '', status: 'published' })
  const list = useCatalogues(businessId, { ...params, page_size: 12, ordering: 'name' })
  const range = useMemo(() => presetRange('30'), [])
  // QR visits come from analytics (catalogue views that arrived via ?src=qr); optional per plan.
  const analytics = useAnalytics(businessId, range, can('analytics.view'))
  const qrVisits = analytics.data?.sources.find((s) => s.key === 'qr_code')?.count
  const [busy, setBusy] = useState<string | null>(null)

  const download = async (c: Catalogue, type: 'png' | 'svg') => {
    setBusy(`${c.id}-${type}`)
    try {
      await downloadQr(c.id, c.slug, type)
    } catch {
      toast.show('Could not download the QR code.', 'error')
    } finally {
      setBusy(null)
    }
  }

  return (
    <RequirePermission codes={['qrcode.view']}>
      <PageHero icon={QrCode} title="QR Codes" description="Print or share a QR code for each published catalogue. Customers scan it to open the catalogue on their phone."
        highlights={['One QR code per catalogue', 'PNG for print, SVG for design tools', 'Uses your brand colour when it scans well', 'See visits that came from QR codes']} />
      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        <div className="flex items-center gap-4 rounded-2xl bg-white p-4 shadow-panel">
          <span className="flex size-12 items-center justify-center rounded-xl bg-brand-50 text-brand-700"><ScanLine className="size-6" aria-hidden /></span>
          <div>
            <p className="text-sm text-muted">Visits via QR code · last 30 days</p>
            <p className="text-2xl font-bold">
              {!can('analytics.view') ? '—' : analytics.isPending ? '…' : isPlanError(analytics.error) ? '—' : (qrVisits ?? 0).toLocaleString()}
            </p>
            {isPlanError(analytics.error) && <p className="text-xs text-muted">Visit counts need a plan with analytics.</p>}
          </div>
        </div>
        <Alert tone="info" title="How QR visits are counted">
          A visit is counted when someone opens the catalogue from the QR code in a browser. Repeat opens by the same browser within 30 minutes count once; scans that aren't opened can't be counted.
        </Alert>
      </div>

      <Toolbar>
        <SearchInput value={params.search} onChange={(search) => setParams((p) => ({ ...p, page: 1, search }))} placeholder="Search catalogues…" />
        <FilterSelect label="Status" value={params.status} onChange={(status) => setParams((p) => ({ ...p, page: 1, status }))}
          options={[{ value: 'published', label: 'Published' }, { value: '', label: 'All catalogues' }, { value: 'draft', label: 'Drafts' }]} />
      </Toolbar>

      {list.isPending ? <Spinner /> : list.isError ? <ErrorState error={list.error} onRetry={() => list.refetch()} /> : list.data.results.length === 0 ? (
        <EmptyState icon={QrCode} title={params.status === 'published' ? 'No published catalogues yet' : 'No catalogues found'}
          description="QR codes are available for published catalogues."
          action={<Link to="/app/catalogues" className={buttonClasses('primary', 'md')}>Go to catalogues</Link>} />
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {list.data.results.map((c) => {
            const published = c.status === 'published'
            const qrLink = `${c.public_url}?src=qr`
            return (
              <li key={c.id} className="flex flex-col rounded-2xl bg-white p-4 shadow-panel">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="truncate font-semibold">{c.name}</h2>
                    <p className="truncate text-xs text-muted">{c.public_url}</p>
                  </div>
                  <StatusPill status={c.status} />
                </div>
                <div className="my-4 flex justify-center">
                  {published ? (
                    <QrImage catalogueId={c.id} alt={`QR code for ${c.name}`} className="size-44 rounded-lg ring-1 ring-border" />
                  ) : (
                    <div className="flex size-44 flex-col items-center justify-center gap-2 rounded-lg bg-canvas text-center text-xs text-muted">
                      <QrCode className="size-8" aria-hidden />
                      Publish this catalogue to create its QR code.
                    </div>
                  )}
                </div>
                <div className="mt-auto grid grid-cols-2 gap-2">
                  <Button variant="secondary" size="sm" disabled={!published} loading={busy === `${c.id}-png`} icon={<Download className="size-4" />} onClick={() => download(c, 'png')}>PNG</Button>
                  <Button variant="secondary" size="sm" disabled={!published} loading={busy === `${c.id}-svg`} icon={<Download className="size-4" />} onClick={() => download(c, 'svg')}>SVG</Button>
                  <Button variant="ghost" size="sm" disabled={!published} icon={<Copy className="size-4" />}
                    onClick={() => navigator.clipboard?.writeText(c.public_url).then(() => toast.show('Link copied.'))}>Copy link</Button>
                  {published ? (
                    <a href={`https://wa.me/?text=${encodeURIComponent(`${c.name} — ${c.public_url}`)}`} target="_blank" rel="noreferrer" className={buttonClasses('ghost', 'sm')}>
                      <MessageCircle className="size-4" aria-hidden /> WhatsApp
                    </a>
                  ) : <span />}
                  {published && (
                    <a href={qrLink} target="_blank" rel="noreferrer" className="col-span-2 inline-flex items-center justify-center gap-1 text-xs text-brand-700 hover:underline">
                      <ExternalLink className="size-3.5" aria-hidden /> Test the QR link
                    </a>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {list.data && <Pagination page={params.page} totalPages={list.data.total_pages} count={list.data.count} pageSize={list.data.page_size} noun="catalogues" onPage={(page) => setParams((p) => ({ ...p, page }))} />}
    </RequirePermission>
  )
}
