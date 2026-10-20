import { Copy, Download, ExternalLink, Globe, Link2, QrCode } from 'lucide-react'
import { useState } from 'react'
import { downloadAdminQr, useAdminCatalogues, useAdminCatalogueSummary } from '@/api/platform'
import { PageHero } from '@/components/panel/PageHero'
import { StatCard } from '@/components/panel/StatCard'
import { SearchInput, Toolbar } from '@/components/panel/Toolbar'
import { Button } from '@/components/ui/Button'
import { Alert, EmptyState, ErrorState, Spinner } from '@/components/ui/Feedback'
import { Pagination } from '@/components/ui/Pagination'
import { useToast } from '@/components/ui/toast'
import { AdminQr } from '@/features/platform/AdminQr'
import { RequirePlatformPermission } from '@/routes/guards'

/**
 * Public links and QR codes for every live catalogue. Custom domains / subdomains are NOT supported:
 * every catalogue lives at {FRONTEND_URL}/c/<business>/<catalogue>, which is what the QR encodes.
 */
export function AdminDomainsQrPage() {
  const toast = useToast()
  const [params, setParams] = useState({ page: 1, search: '' })
  const list = useAdminCatalogues({ ...params, status: 'published', page_size: 12, ordering: '-view_count' })
  const summary = useAdminCatalogueSummary()
  const rows = list.data?.results ?? []

  return (
    <RequirePlatformPermission code="platform.catalogue.view">
      <PageHero icon={Globe} title="Domains & QR" description="Public catalogue links and QR codes across the platform." />
      <Alert tone="info" title="Custom domains are not available yet" className="mb-6">
        Every catalogue is served at its canonical link (<code>/c/&lt;business&gt;/&lt;catalogue&gt;</code> on the main site), and its QR code points
        there. Business subdomains or own domains need DNS verification, TLS certificates and host routing that this deployment doesn't have —
        so none are listed or offered here.
      </Alert>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        <StatCard icon={Link2} tone="green" label="Live Public Links" value={summary.data?.live ?? '—'} loading={summary.isPending} hint="Published, business active" />
        <StatCard icon={QrCode} label="QR Codes Available" value={summary.data?.published ?? '—'} loading={summary.isPending} hint="One per published catalogue" />
        <StatCard icon={Globe} tone="slate" label="Custom Domains" value="Not supported" />
      </div>
      <Toolbar>
        <SearchInput value={params.search} onChange={(search) => setParams({ page: 1, search })} placeholder="Search by catalogue or business…" />
      </Toolbar>
      {list.isPending ? <Spinner /> : list.isError ? <ErrorState error={list.error} onRetry={() => list.refetch()} /> : rows.length === 0 ? (
        <EmptyState icon={QrCode} title={params.search ? 'No published catalogues match' : 'No published catalogues yet'} description="QR codes exist only for published catalogues." />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((c) => (
            <li key={c.id} className="flex gap-4 rounded-2xl bg-white p-4 shadow-panel">
              <AdminQr catalogueId={c.id} alt={`QR code for ${c.name}`} className="size-24 shrink-0 rounded-lg ring-1 ring-border" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{c.name}</p>
                <p className="truncate text-sm text-muted">{c.business_name}{c.business_status !== 'active' && ' · suspended (link offline)'}</p>
                <a href={c.public_url!} target="_blank" rel="noreferrer" className="mt-1 flex items-center gap-1 truncate text-xs text-brand-700 hover:underline">
                  <ExternalLink className="size-3 shrink-0" aria-hidden /> <span className="truncate">{c.public_url}</span>
                </a>
                <p className="mt-1 text-xs text-muted">{c.view_count.toLocaleString()} views</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Button size="sm" variant="secondary" icon={<Download className="size-3.5" />} onClick={() => downloadAdminQr(c, 'png').catch(() => toast.show('Download failed.', 'error'))}>PNG</Button>
                  <Button size="sm" variant="secondary" icon={<Download className="size-3.5" />} onClick={() => downloadAdminQr(c, 'svg').catch(() => toast.show('Download failed.', 'error'))}>SVG</Button>
                  <Button size="sm" variant="ghost" icon={<Copy className="size-3.5" />} onClick={() => navigator.clipboard?.writeText(c.public_url!).then(() => toast.show('Link copied.'))}>Copy</Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {list.data && <Pagination page={params.page} totalPages={list.data.total_pages} count={list.data.count} pageSize={list.data.page_size} noun="catalogues" onPage={(page) => setParams((p) => ({ ...p, page }))} />}
    </RequirePlatformPermission>
  )
}
