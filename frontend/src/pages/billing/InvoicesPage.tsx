import { ArrowLeft, Download, Eye, FileCheck2, FileText, FileX2, Receipt } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { downloadPdf, useInvoice, useInvoices } from '@/api/billing'
import { PageHero } from '@/components/panel/PageHero'
import { StatCard } from '@/components/panel/StatCard'
import { FilterSelect, SearchInput, Toolbar } from '@/components/panel/Toolbar'
import { Button } from '@/components/ui/Button'
import { rowIconButton } from '@/components/ui/buttonStyles'
import { Card, CardBody } from '@/components/ui/Card'
import { Alert, Badge, EmptyState, ErrorState, Spinner } from '@/components/ui/Feedback'
import { Pagination } from '@/components/ui/Pagination'
import { useActiveBusiness } from '@/features/business/BusinessContext'
import { formatDate, formatMoney } from '@/features/billing/format'
import { RequirePermission } from '@/routes/guards'
import type { Party } from '@/types/billing'
import { errorMessage } from '@/utils/formErrors'

function DownloadButton({ id, number, size = 'sm' }: { id: string; number: string; size?: 'sm' | 'md' }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <span className="inline-flex flex-col items-end">
      <Button
        variant={size === 'sm' ? 'soft' : 'secondary'}
        size={size}
        icon={<Download className="size-4" />}
        loading={busy}
        aria-label={`Download ${number} as PDF`}
        onClick={async () => {
          setBusy(true)
          setError(null)
          try {
            await downloadPdf(`/billing/invoices/${id}/pdf/`, `${number}.pdf`)
          } catch (e) {
            setError(errorMessage(e))
          } finally {
            setBusy(false)
          }
        }}
      >
        PDF
      </Button>
      {error && <span className="mt-1 text-xs text-red-600">{error}</span>}
    </span>
  )
}

export function InvoicesPage() {
  const { businessId } = useActiveBusiness()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const invoices = useInvoices(businessId, page, { search, status })
  // Totals per status read only the counts (page_size=1).
  const all = useInvoices(businessId, 1, { page_size: 1 })
  const paid = useInvoices(businessId, 1, { page_size: 1, status: 'paid' })
  const voided = useInvoices(businessId, 1, { page_size: 1, status: 'void' })
  const filtered = Boolean(search || status)

  return (
    <RequirePermission codes={['invoice.view']}>
      <PageHero icon={Receipt} title="Invoices"
        description="View and manage all your invoices. Invoices are issued automatically for every confirmed subscription payment." />
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
        <StatCard icon={FileText} label="Total Invoices" value={all.data?.count ?? '—'} loading={all.isPending} hint="All time" />
        <StatCard icon={FileCheck2} tone="green" label="Paid Invoices" value={paid.data?.count ?? '—'} loading={paid.isPending} />
        <StatCard icon={FileX2} tone="pink" label="Void Invoices" value={voided.data?.count ?? '—'} loading={voided.isPending} />
      </div>
      <Toolbar>
        <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1) }} placeholder="Search by invoice no…" />
        <FilterSelect label="Status" value={status} onChange={(v) => { setStatus(v); setPage(1) }}
          options={[{ value: '', label: 'All Status' }, { value: 'paid', label: 'Paid' }, { value: 'void', label: 'Void' }]} />
      </Toolbar>
      {invoices.isPending ? (
        <Spinner />
      ) : invoices.isError ? (
        <ErrorState error={invoices.error} onRetry={() => invoices.refetch()} />
      ) : invoices.data.results.length === 0 ? (
        <EmptyState icon={Receipt} title={filtered ? 'No invoices match your filters' : 'No invoices yet'} description="Your first invoice appears once a payment is confirmed." />
      ) : (
        <>
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-ink">
                <thead className="bg-thead text-[13px] font-semibold text-ink">
                  <tr>
                    <th scope="col" className="px-5 py-3">Invoice No.</th>
                    <th scope="col" className="px-3 py-3">Type</th>
                    <th scope="col" className="hidden px-3 py-3 md:table-cell">Plan / Item</th>
                    <th scope="col" className="px-3 py-3">Amount</th>
                    <th scope="col" className="px-3 py-3">Date</th>
                    <th scope="col" className="hidden px-3 py-3 lg:table-cell">Period</th>
                    <th scope="col" className="px-3 py-3">Status</th>
                    <th scope="col" className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {invoices.data.results.map((inv) => (
                    <tr key={inv.id}>
                      <td className="px-5 py-3 font-medium whitespace-nowrap">
                        {inv.number} {inv.is_test && <Badge tone="warning">Test</Badge>}
                      </td>
                      <td className="px-3 py-3"><span className="rounded-md bg-[#e0ebff] px-2.5 py-1 text-xs font-medium text-[#1f5fe0]">Subscription</span></td>
                      <td className="hidden max-w-56 truncate px-3 py-3 md:table-cell">{inv.lines[0]?.description ?? '—'}</td>
                      <td className="px-3 py-3 font-medium whitespace-nowrap">{formatMoney(inv.total, inv.currency)}</td>
                      <td className="px-3 py-3 whitespace-nowrap">{formatDate(inv.issued_at)}</td>
                      <td className="hidden px-3 py-3 whitespace-nowrap lg:table-cell">{formatDate(inv.period_start)} – {formatDate(inv.period_end)}</td>
                      <td className="px-3 py-3"><Badge tone={inv.status === 'paid' ? 'success' : 'neutral'}>{inv.status === 'paid' ? 'Paid' : 'Void'}</Badge></td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          <Link to={`/app/billing/invoices/${inv.id}`} className={rowIconButton} aria-label={`View ${inv.number}`} title="View"><Eye className="size-4" /></Link>
                          <DownloadButton id={inv.id} number={inv.number} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <Pagination page={page} totalPages={invoices.data.total_pages} count={invoices.data.count} pageSize={invoices.data.page_size} noun="invoices" onPage={setPage} />
        </>
      )}
    </RequirePermission>
  )
}

function PartyBlock({ title, party }: { title: string; party: Party }) {
  return (
    <div className="text-sm">
      <p className="text-xs font-semibold tracking-wide text-muted uppercase">{title}</p>
      <p className="mt-1 font-medium">{party.name || '—'}</p>
      {party.contact && <p>{party.contact}</p>}
      {party.address && <p className="text-muted">{party.address}</p>}
      {party.email && <p className="text-muted">{party.email}</p>}
      {party.tax_id && <p className="text-muted">Tax ID: {party.tax_id}</p>}
    </div>
  )
}

export function InvoiceDetailPage() {
  const { invoiceId = '' } = useParams()
  const invoice = useInvoice(invoiceId)

  return (
    <RequirePermission codes={['invoice.view']}>
      <Link to="/app/billing/invoices" className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline">
        <ArrowLeft className="size-4" aria-hidden /> All invoices
      </Link>
      {invoice.isPending ? (
        <Spinner />
      ) : invoice.isError ? (
        <ErrorState error={invoice.error} onRetry={() => invoice.refetch()} />
      ) : (
        <Card className="mx-auto max-w-3xl">
          <CardBody className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold">Invoice {invoice.data.number}</h1>
                <p className="text-sm text-muted">Issued {formatDate(invoice.data.issued_at)}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={invoice.data.status === 'paid' ? 'success' : 'neutral'}>
                  {invoice.data.status === 'paid' ? 'Paid' : 'Void'}
                </Badge>
                <DownloadButton id={invoice.data.id} number={invoice.data.number} size="md" />
              </div>
            </div>
            {invoice.data.is_test && <Alert tone="warning">Test-mode invoice: no real payment was made.</Alert>}
            <div className="grid gap-6 sm:grid-cols-2">
              <PartyBlock title="From" party={invoice.data.seller} />
              <PartyBlock title="Bill to" party={invoice.data.buyer} />
            </div>
            <table className="w-full text-left text-sm">
              <thead className="bg-thead text-[13px] font-semibold text-ink">
                <tr>
                  <th scope="col" className="py-2">Description</th>
                  <th scope="col" className="py-2 text-right">Qty</th>
                  <th scope="col" className="py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {invoice.data.lines.map((line, i) => (
                  <tr key={i} className="border-b border-border">
                    <td className="py-3">{line.description}</td>
                    <td className="py-3 text-right">{line.quantity}</td>
                    <td className="py-3 text-right">{formatMoney(line.amount, invoice.data.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <dl className="ml-auto max-w-xs space-y-1 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">Subtotal</dt>
                <dd>{formatMoney(invoice.data.subtotal, invoice.data.currency)}</dd>
              </div>
              {Number(invoice.data.discount_amount) > 0 && (
                <div className="flex justify-between">
                  <dt className="text-muted">Discount</dt>
                  <dd>−{formatMoney(invoice.data.discount_amount, invoice.data.currency)}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-muted">
                  {Number(invoice.data.tax_rate) > 0
                    ? `${invoice.data.tax_name || 'Tax'} ${invoice.data.tax_rate}%${invoice.data.tax_inclusive ? ' (included)' : ''}`
                    : 'Tax (not configured)'}
                </dt>
                <dd>{formatMoney(invoice.data.tax_amount, invoice.data.currency)}</dd>
              </div>
              <div className="flex justify-between border-t border-border pt-2 text-base font-semibold">
                <dt>Total paid</dt>
                <dd>{formatMoney(invoice.data.total, invoice.data.currency)}</dd>
              </div>
            </dl>
          </CardBody>
        </Card>
      )}
    </RequirePermission>
  )
}
