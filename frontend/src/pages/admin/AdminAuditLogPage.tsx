import { CalendarDays, ScrollText } from 'lucide-react'
import { useState } from 'react'
import { usePlatformAudit, usePlatformAuditFilters } from '@/api/workspace'
import { PageHero } from '@/components/panel/PageHero'
import { FilterSelect, SearchInput, Toolbar } from '@/components/panel/Toolbar'
import { Button } from '@/components/ui/Button'
import { ActivityTable } from '@/features/workspace/ActivityTable'
import { actionLabel } from '@/features/workspace/format'
import { RequirePlatformPermission } from '@/routes/guards'

const EMPTY = { search: '', scope: '', module: '', action: '', created_from: '', created_to: '' }

export function AdminAuditLogPage() {
  const [params, setParams] = useState({ page: 1, ...EMPTY })
  const list = usePlatformAudit({ ...params, page_size: 25 })
  const options = usePlatformAuditFilters()
  const set = (patch: Partial<typeof params>) => setParams((p) => ({ ...p, page: 1, ...patch }))
  const filtered = Object.entries(EMPTY).some(([k]) => params[k as keyof typeof EMPTY])
  const actions = (options.data?.actions ?? []).filter((a) => !params.module || a.startsWith(`${params.module}.`))

  return (
    <RequirePlatformPermission code="platform.audit_log.view">
      <PageHero icon={ScrollText} title="Audit Logs" description="Platform-wide, append-only trail of business changes, billing events, Super Admin actions and sign-in security events." />
      <Toolbar end={filtered && <Button variant="ghost" size="sm" onClick={() => set(EMPTY)}>Reset</Button>}>
        <SearchInput value={params.search} onChange={(search) => set({ search })} placeholder="Search item, person, business or request ID…" />
        <FilterSelect label="Scope" value={params.scope} onChange={(scope) => set({ scope })}
          options={[{ value: '', label: 'All scopes' }, { value: 'business', label: 'Business' }, { value: 'platform', label: 'Platform' }, { value: 'account', label: 'Account security' }]} />
        <FilterSelect label="Area" value={params.module} onChange={(module) => set({ module, action: '' })}
          options={[{ value: '', label: 'All areas' }, ...(options.data?.modules ?? []).map((m) => ({ value: m, label: m }))]} />
        <FilterSelect label="Action" value={params.action} onChange={(action) => set({ action })}
          options={[{ value: '', label: 'All actions' }, ...actions.map((a) => ({ value: a, label: actionLabel(a) }))]} />
        <label className="flex items-center gap-1.5 text-sm text-muted">
          <CalendarDays className="size-4" aria-hidden />
          <input type="date" aria-label="From date" value={params.created_from} max={params.created_to || undefined} onChange={(e) => set({ created_from: e.target.value })} className="h-10 rounded-lg border border-border px-2 text-sm text-ink" />
          –
          <input type="date" aria-label="To date" value={params.created_to} min={params.created_from || undefined} onChange={(e) => set({ created_to: e.target.value })} className="h-10 rounded-lg border border-border px-2 text-sm text-ink" />
        </label>
      </Toolbar>
      <ActivityTable query={list} page={params.page} onPage={(page) => setParams((p) => ({ ...p, page }))} filtered={filtered} showBusiness />
    </RequirePlatformPermission>
  )
}
