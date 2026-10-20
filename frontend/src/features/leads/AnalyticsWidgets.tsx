import { ArrowDownRight, ArrowUpRight, Eye, MessageSquare, Table2, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { percentChange, shortDate } from '@/components/charts/chartUtils'
import { MultiLineChart } from '@/components/charts/MultiLineChart'
import { Sparkline } from '@/components/charts/Sparkline'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { MediaThumb } from '@/features/content/MediaThumb'
import type { MediaBrief } from '@/types/content'
import type { AnalyticsOverview } from '@/types/leads'
import { cn } from '@/utils/cn'

/** Reference KPI card: pastel icon tile, value, change vs the previous period, real sparkline. */
export function KpiTile({ icon: Icon, label, value, previous, days, tone, hint, spark, sparkColor = '#2f6df6' }: {
  icon: LucideIcon; label: string; value: number; previous: number; days: number; tone: string; hint?: string; spark?: number[]; sparkColor?: string
}) {
  const change = percentChange(value, previous)
  return (
    <div className="@container flex items-center gap-4 rounded-2xl bg-white p-4 shadow-panel">
      <span className={cn('flex size-16 shrink-0 items-center justify-center rounded-2xl', tone)}><Icon className="size-8" fill="currentColor" fillOpacity={0.16} aria-hidden /></span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] text-ink/85">{label}</p>
        <p className="text-[24px] leading-tight font-bold text-ink tabular-nums">{value.toLocaleString()}</p>
        <p className="text-[12px] leading-tight text-body">
          {change === null ? (
            <span>new vs previous {days} days</span>
          ) : (
            <>
              <span className={cn('inline-flex items-center font-semibold', change > 0 ? 'text-[#14a04a]' : change < 0 ? 'text-red-600' : 'text-body')}>
                {change > 0 ? <ArrowUpRight className="size-3.5" aria-hidden /> : change < 0 ? <ArrowDownRight className="size-3.5" aria-hidden /> : null}
                {change > 0 ? '+' : ''}{change}%
              </span>
              <span className="block">vs previous {days} days{hint ? ` · ${hint}` : ''}</span>
            </>
          )}
        </p>
      </div>
      {spark && <div className="hidden @min-[17rem]:block"><Sparkline values={spark} color={sparkColor} /></div>}
    </div>
  )
}

/** Ranked rows (1, 2, 3 …) with thumbnail, views, enquiries and a bar scaled to the top row. */
export function RankedList({ rows, empty }: {
  rows: { id: string; name: string; views: number; enquiries: number; media: MediaBrief | null; href: string }[]
  empty: string
}) {
  if (rows.length === 0) return <p className="py-8 text-center text-sm text-body">{empty}</p>
  const max = Math.max(...rows.map((r) => r.views), 1)
  return (
    <ol className="space-y-3">
      {rows.map((r, i) => (
        <li key={r.id} className="grid grid-cols-[24px_32px_minmax(0,1fr)_auto] items-center gap-2.5 text-[13px] text-ink">
          <span className="flex size-6 items-center justify-center rounded-full bg-[#eef4fd] text-[12px] font-semibold">{i + 1}</span>
          <MediaThumb media={r.media} alt="" className="size-8 rounded-md" />
          <span className="min-w-0">
            <Link to={r.href} className="block truncate font-semibold hover:text-brand-700">{r.name}</Link>
            <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-[#e8eef7]"><span className="block h-full rounded-full bg-brand-700" style={{ width: `${(r.views / max) * 100}%` }} /></span>
          </span>
          <span className="flex items-center gap-3 text-[12px] whitespace-nowrap text-body tabular-nums">
            <span className="inline-flex items-center gap-1"><Eye className="size-3.5" aria-hidden />{r.views.toLocaleString()}</span>
            <span className="inline-flex items-center gap-1"><MessageSquare className="size-3.5" aria-hidden />{r.enquiries.toLocaleString()}</span>
          </span>
        </li>
      ))}
    </ol>
  )
}

/** Views and enquiries as two single-series charts on the same date axis (no dual axis). */
export function TrendCard({ data, title = 'Views & Enquiries Trend' }: { data: AnalyticsOverview; title?: string }) {
  const [table, setTable] = useState(false)
  const empty = data.series.every((p) => p.catalogue_views === 0 && p.enquiries === 0)
  return (
    <Card>
      <CardHeader
        title={title}
        action={
          <button type="button" onClick={() => setTable((t) => !t)} aria-pressed={table}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#d5e5fa] px-2.5 py-1.5 text-xs font-medium text-ink hover:bg-brand-50">
            <Table2 className="size-3.5" aria-hidden /> {table ? 'Show chart' : 'Show table'}
          </button>
        }
      />
      <CardBody>
        {empty && !table ? (
          <p className="py-10 text-center text-sm text-muted">No views or enquiries in this period yet. Share a catalogue link or QR code to start collecting data.</p>
        ) : table ? (
          <div className="max-h-72 overflow-y-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-thead text-[13px] font-semibold text-ink">
                <tr><th scope="col" className="py-2">Date</th><th scope="col" className="py-2 text-right">Catalogue views</th><th scope="col" className="py-2 text-right">Product views</th><th scope="col" className="py-2 text-right">Enquiries</th></tr>
              </thead>
              <tbody className="divide-y divide-border tabular-nums">
                {data.series.map((p) => (
                  <tr key={p.date}><td className="py-1.5">{shortDate(p.date)}</td><td className="py-1.5 text-right">{p.catalogue_views}</td><td className="py-1.5 text-right">{p.product_views}</td><td className="py-1.5 text-right">{p.enquiries}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          // Both are counts, so they share one y-axis (no dual axis), as in the reference trend card.
          <MultiLineChart label="Catalogue views and enquiries" height={230} dates={data.series.map((p) => p.date)} series={[
            { key: 'views', label: 'Views', color: '#2f6df6', values: data.series.map((p) => p.catalogue_views) },
            { key: 'enquiries', label: 'Enquiries', color: '#1d9b4b', values: data.series.map((p) => p.enquiries) },
          ]} />
        )}
      </CardBody>
    </Card>
  )
}
