import { BarChart3, Box, Eye, MapPin, MessageCircle, Users } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAnalytics, useEnquiries } from '@/api/leads'
import { toSegments } from '@/components/charts/chartUtils'
import { Donut, DonutLegend } from '@/components/charts/Donut'
import { PageHero } from '@/components/panel/PageHero'
import { PlanLimitAlert } from '@/components/panel/PlanLimitAlert'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { ErrorState, Spinner } from '@/components/ui/Feedback'
import { useActiveBusiness } from '@/features/business/BusinessContext'
import { isPlanError } from '@/features/content/format'
import { KpiTile, RankedList, TrendCard } from '@/features/leads/AnalyticsWidgets'
import { Avatar, EnquiryStatusPill } from '@/features/leads/LeadBits'
import { presetRange } from '@/features/leads/dateRange'
import { RangePicker } from '@/features/leads/RangePicker'
import { RequirePermission } from '@/routes/guards'
import type { Breakdown } from '@/types/leads'
import { dayMonthYear } from '@/utils/dates'

function ViewAll({ to }: { to: string }) {
  return <Link to={to} className="text-[13px] font-medium text-brand-700 hover:underline">View All →</Link>
}

function DonutCard({ title, rows, centerLabel, empty }: { title: string; rows: Breakdown[]; centerLabel: string; empty: string }) {
  const segments = toSegments(rows)
  const total = rows.reduce((a, r) => a + r.count, 0)
  return (
    <Card>
      <CardHeader title={title} />
      <CardBody>
        {total === 0 ? <p className="py-10 text-center text-sm text-body">{empty}</p> : (
          <div className="flex items-center gap-6">
            <Donut segments={segments} centerValue={total.toLocaleString()} centerLabel={centerLabel} size={156} />
            <DonutLegend segments={segments} />
          </div>
        )}
      </CardBody>
    </Card>
  )
}

export function AnalyticsPage() {
  const { businessId, can } = useActiveBusiness()
  const [range, setRange] = useState(() => presetRange('30'))
  const overview = useAnalytics(businessId, range)
  const recent = useEnquiries(businessId, { page_size: 5 }, can('enquiry.view'))
  const d = overview.data

  return (
    <RequirePermission codes={['analytics.view']}>
      <PageHero icon={BarChart3} title="Analytics" description="Get detailed insights about your catalogues, products and customer engagement. Track views, enquiries and grow your business."
        action={<RangePicker value={range} onChange={setRange} />} />
      {overview.isPending ? (
        <Spinner label="Loading analytics…" />
      ) : isPlanError(overview.error) ? (
        <PlanLimitAlert error={overview.error} />
      ) : overview.isError ? (
        <ErrorState error={overview.error} onRetry={() => overview.refetch()} />
      ) : d && (
        <div className={overview.isFetching ? 'space-y-4 opacity-70 transition-opacity' : 'space-y-4'}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiTile icon={Eye} tone="bg-[#d5e9fd] text-[#085afc]" label="Total Views" value={d.totals.catalogue_views} previous={d.previous.catalogue_views} days={d.range.days}
              spark={d.series.map((p) => p.catalogue_views)} sparkColor="#3d8bfd" />
            <KpiTile icon={MessageCircle} tone="bg-[#d9f9e6] text-[#16a34a]" label="Total Enquiries" value={d.totals.enquiries} previous={d.previous.enquiries} days={d.range.days}
              hint={`${d.totals.conversions} converted`} spark={d.series.map((p) => p.enquiries)} sparkColor="#3fcf78" />
            <KpiTile icon={Box} tone="bg-[#fddaed] text-[#f0107f]" label="Total Products Viewed" value={d.totals.products_viewed} previous={d.previous.products_viewed} days={d.range.days}
              spark={d.series.map((p) => p.product_views)} sparkColor="#f45aa5" />
            <KpiTile icon={Users} tone="bg-[#e8ddfd] text-[#8b2cf5]" label="Unique Visitors" value={d.totals.unique_visitors} previous={d.previous.unique_visitors} days={d.range.days} />
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <TrendCard data={d} />
            <Card>
              <CardHeader title="Top Performing Catalogues" action={<ViewAll to="/app/catalogues" />} />
              <CardBody>
                <RankedList empty="No catalogue activity in this period."
                  rows={d.top_catalogues.map((c) => ({ id: c.id, name: c.name, views: c.views, enquiries: c.enquiries, media: c.cover, href: `/app/catalogues/${c.id}` }))} />
              </CardBody>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-3 [&>*]:min-w-0">
            <DonutCard title="Traffic Sources" rows={d.sources} centerLabel="Total Views" empty="No visits recorded in this period." />
            <DonutCard title="Device Wise Visitors" rows={d.devices} centerLabel="Visitors" empty="No visitors recorded in this period." />
            <Card>
              <CardHeader title="Top Products" action={<ViewAll to="/app/products" />} />
              <CardBody>
                <RankedList empty="No product views in this period."
                  rows={d.top_products.map((p) => ({ id: p.id, name: p.name, views: p.views, enquiries: p.enquiries, media: p.thumbnail, href: `/app/products/${p.id}` }))} />
              </CardBody>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-3 [&>*]:min-w-0">
            <DonutCard title="Enquiries by Status" rows={d.enquiries_by_status} centerLabel="Total Enquiries" empty="No enquiries in this period." />
            <Card>
              <CardHeader title="Top Locations" />
              <CardBody>
                <div className="flex flex-col items-center gap-2 py-8 text-center">
                  <span className="flex size-12 items-center justify-center rounded-2xl bg-[#e3effd] text-brand-700"><MapPin className="size-6" aria-hidden /></span>
                  <p className="max-w-64 text-sm text-body">Locations are not tracked: myEcatalogues does not store visitor IP addresses.</p>
                </div>
              </CardBody>
            </Card>
            {can('enquiry.view') && (
              <Card>
                <CardHeader title="Recent Enquiries" action={<ViewAll to="/app/enquiries" />} />
                <CardBody className="px-3 pt-0">
                  {recent.data?.results.length ? (
                    <div className="overflow-x-auto">
                    <table className="w-full text-left text-[12.5px] text-ink">
                      <thead className="bg-thead font-semibold"><tr><th scope="col" className="px-2 py-2">Name</th><th scope="col" className="px-2 py-2">Product</th><th scope="col" className="hidden px-2 py-2 sm:table-cell">Date</th><th scope="col" className="px-2 py-2">Status</th></tr></thead>
                      <tbody>
                        {recent.data.results.map((e) => (
                          <tr key={e.id}>
                            <td className="px-2 py-1.5">
                              <Link to={`/app/enquiries?enquiry=${e.id}`} className="flex items-center gap-2 font-medium hover:text-brand-700">
                                <span className="scale-75"><Avatar name={e.name} /></span><span className="truncate">{e.name}</span>
                              </Link>
                            </td>
                            <td className="max-w-28 truncate px-2 py-1.5">{e.product_name || '—'}</td>
                            <td className="hidden px-2 py-1.5 whitespace-nowrap sm:table-cell">{dayMonthYear(new Date(e.created_at))}</td>
                            <td className="px-2 py-1.5"><EnquiryStatusPill status={e.status} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    </div>
                  ) : <p className="px-2 py-6 text-center text-sm text-body">No enquiries yet.</p>}
                </CardBody>
              </Card>
            )}
          </div>
          <p className="text-xs text-body">Numbers are approximate: repeat visits within 30 minutes and bots are not counted.</p>
        </div>
      )}
    </RequirePermission>
  )
}
