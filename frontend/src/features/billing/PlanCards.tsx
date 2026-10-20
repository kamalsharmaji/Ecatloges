import { Building2, Crown, FlaskConical, Gem, Leaf, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { CheckDot } from '@/components/panel/PageHero'
import { buttonClasses } from '@/components/ui/buttonStyles'
import { Badge } from '@/components/ui/Feedback'
import { formatMoney, intervalLabel, limitLines } from '@/features/billing/format'
import type { Plan } from '@/types/billing'
import { cn } from '@/utils/cn'

// Icon tile per card position, as in the reference (leaf, crown, diamond, building).
const ICONS: { icon: LucideIcon; tone: string }[] = [
  { icon: Leaf, tone: 'bg-[#e0edff] text-[#1f6fff]' },
  { icon: Crown, tone: 'bg-[#fff1d6] text-[#f59e0b]' },
  { icon: Gem, tone: 'bg-[#efe4ff] text-[#7c3aed]' },
  { icon: Building2, tone: 'bg-[#e6e9ff] text-[#4f46e5]' },
]

/** Plan cards from the reference subscription screen; data and limits come from the live plan list. */
export function PlanCards({ plans, currentPlanId, canBuy, compact = false }: { plans: Plan[]; currentPlanId?: string; canBuy: boolean; compact?: boolean }) {
  return (
    <div className={cn('grid gap-4 sm:grid-cols-2', plans.length >= 4 ? 'xl:grid-cols-4' : 'xl:grid-cols-3')}>
      {plans.map((plan, i) => {
        const isCurrent = plan.id === currentPlanId
        const { icon: Icon, tone } = ICONS[i % ICONS.length]!
        const lines = limitLines(plan)
        return (
          <article key={plan.id}
            className={cn('flex flex-col rounded-2xl bg-white p-5 shadow-panel', isCurrent && 'ring-2 ring-brand-600')}>
            <div className="flex items-start gap-3">
              <span className={cn('flex size-12 shrink-0 items-center justify-center rounded-xl', tone)}>
                <Icon className="size-6" fill="currentColor" fillOpacity={0.18} aria-hidden />
              </span>
              <div className="min-w-0">
                <h2 className="flex flex-wrap items-center gap-2 text-[17px] font-bold text-ink">
                  {plan.name}
                  {plan.is_development_seed && <Badge tone="warning"><FlaskConical className="mr-1 size-3" aria-hidden /> Placeholder</Badge>}
                </h2>
                {plan.description && <p className="line-clamp-2 text-[12.5px] text-body">{plan.description}</p>}
              </div>
            </div>
            <p className="mt-3">
              <span className="text-[26px] font-bold text-ink">{formatMoney(plan.price, plan.currency).replace(/\.00$/, '')}</span>
              <span className="text-[13px] text-body"> / {intervalLabel(plan.interval)}</span>
            </p>
            <ul className="mt-3 flex-1 space-y-2 text-[13.5px] text-ink">
              {(compact ? lines.slice(0, 5) : lines).map((line) => (
                <li key={line} className="flex items-center gap-2"><CheckDot className="size-4" /> {line}</li>
              ))}
            </ul>
            {isCurrent ? (
              <span className={buttonClasses('primary', 'md', 'mt-4 w-full pointer-events-none')}>Current Plan</span>
            ) : canBuy ? (
              <Link to={`/app/billing/checkout/${plan.id}`} className={buttonClasses('secondary', 'md', 'mt-4 w-full')}>
                {currentPlanId ? 'Switch Plan' : 'Get Started'}
              </Link>
            ) : null}
            {isCurrent && canBuy && (
              <Link to={`/app/billing/checkout/${plan.id}`} className="mt-2 text-center text-[13px] font-medium text-brand-700 hover:underline">Renew this plan</Link>
            )}
          </article>
        )
      })}
    </div>
  )
}

/** Feature comparison built from each plan's real limits. */
export function PlanComparison({ plans }: { plans: Plan[] }) {
  const n = (v: number | null) => (v === null ? '∞' : v.toLocaleString())
  const gb = (mb: number | null) => (mb === null ? '∞' : mb >= 1024 ? `${Math.round(mb / 1024)} GB` : `${mb} MB`)
  const yes = (b: boolean) => (b ? <CheckDot className="mx-auto size-4" /> : <span className="text-body">–</span>)
  const rows: [string, (p: Plan) => ReactNode][] = [
    ['Catalogues', (p) => n(p.max_catalogues)],
    ['Products', (p) => n(p.max_products)],
    ['Team Members', (p) => n(p.max_staff)],
    ['Storage', (p) => gb(p.storage_limit_mb)],
    ['Video Uploads', (p) => yes(p.video_uploads_enabled)],
    ['Analytics', (p) => yes(p.analytics_enabled)],
    ['Custom Branding', (p) => yes(p.custom_branding)],
    ['CSV Import', (p) => yes(p.csv_import_enabled)],
  ]
  return (
    <div className="overflow-x-auto">
      <p className="sr-only">∞ means unlimited.</p>
      <table className="w-full text-[12px] text-ink">
        <thead className="bg-thead font-semibold">
          <tr>
            <th scope="col" className="px-2 py-2 text-left">Features</th>
            {plans.map((p) => <th key={p.id} scope="col" className="px-1 py-2 text-center text-[11px] leading-tight">{p.name.replace(/^\[DEV\]\s*/, '')}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map(([label, cell]) => (
            <tr key={label}>
              <th scope="row" className="px-2 py-2.5 text-left font-medium">{label}</th>
              {plans.map((p) => <td key={p.id} className="px-1 py-2.5 text-center text-[11.5px]">{cell(p)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
