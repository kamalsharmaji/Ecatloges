import { CalendarDays, History } from 'lucide-react'
import { useState } from 'react'
import { useActivity, useActivityFilters } from '@/api/workspace'
import { PageHero } from '@/components/panel/PageHero'
import { FilterSelect, SearchInput, Toolbar } from '@/components/panel/Toolbar'
import { Button } from '@/components/ui/Button'
import { useActiveBusiness } from '@/features/business/BusinessContext'
import { ActivityTable } from '@/features/workspace/ActivityTable'
import { actionLabel } from '@/features/workspace/format'
import { RequirePermission } from '@/routes/guards'

const EMPTY = { search: '', module: '', action: '', actor: '', created_from: '', created_to: '' }

export function ActivityLogPage() {
  const { businessId } = useActiveBusiness()
  const [params, setParams] = useState({ page: 1, ...EMPTY })
  const list = useActivity(businessId, { ...params, page_size: 20 })
  const options = useActivityFilters(businessId)
  const set = (patch: Partial<typeof params>) => setParams((p) => ({ ...p, page: 1, ...patch }))
  const filtered = Object.entries(EMPTY).some(([k]) => params[k as keyof typeof EMPTY])
  const actions = (options.data?.actions ?? []).filter((a) => !params.module || a.startsWith(`${params.module}.`))

  return (
    <RequirePermission codes={['audit_log.view']}>
      <PageHero icon={History} title="Activity Log" description="A read-only record of who changed what in your business: catalogues, products, enquiries, team, roles and billing."
        highlights={['Every important change, with who and when', 'Before → after for key fields', 'Contact details and notes are never stored here', 'Entries can’t be edited or deleted']} />
      <Toolbar end={filtered && <Button variant="ghost" size="sm" onClick={() => set(EMPTY)}>Reset</Button>}>
        <SearchInput value={params.search} onChange={(search) => set({ search })} placeholder="Search item, action or person…" />
        <FilterSelect label="Area" value={params.module} onChange={(module) => set({ module, action: '' })}
          options={[{ value: '', label: 'All areas' }, ...(options.data?.modules ?? []).map((m) => ({ value: m, label: m.charAt(0).toUpperCase() + m.slice(1).replace(/_/g, ' ') }))]} />
        <FilterSelect label="Action" value={params.action} onChange={(action) => set({ action })}
          options={[{ value: '', label: 'All actions' }, ...actions.map((a) => ({ value: a, label: actionLabel(a) }))]} />
        <FilterSelect label="Person" value={params.actor} onChange={(actor) => set({ actor })}
          options={[{ value: '', label: 'Everyone' }, ...(options.data?.actors ?? []).map((a) => ({ value: a.id, label: a.name }))]} />
        <label className="flex items-center gap-1.5 text-sm text-muted">
          <CalendarDays className="size-4" aria-hidden />
          <input type="date" aria-label="From date" value={params.created_from} max={params.created_to || undefined} onChange={(e) => set({ created_from: e.target.value })} className="h-10 rounded-lg border border-border px-2 text-sm text-ink" />
          –
          <input type="date" aria-label="To date" value={params.created_to} min={params.created_from || undefined} onChange={(e) => set({ created_to: e.target.value })} className="h-10 rounded-lg border border-border px-2 text-sm text-ink" />
        </label>
      </Toolbar>
      <ActivityTable query={list} page={params.page} onPage={(page) => setParams((p) => ({ ...p, page }))} filtered={filtered} />
    </RequirePermission>
  )
}
