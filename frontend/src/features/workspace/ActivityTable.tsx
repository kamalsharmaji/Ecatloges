import { History } from 'lucide-react'
import { EmptyState, ErrorState, Spinner } from '@/components/ui/Feedback'
import { Pagination } from '@/components/ui/Pagination'
import { Avatar } from '@/features/leads/LeadBits'
import { formatDateTime } from '@/features/leads/leadFormat'
import type { Paginated } from '@/types/api'
import type { AuditEntry } from '@/types/workspace'
import { ChangeList } from './Bits'
import { actionLabel, relativeTime } from './format'

const ACTOR_FALLBACK: Record<string, string> = { system: 'System', public: 'Catalogue visitor' }

/** Read-only audit table shared by the business Activity Log and the platform audit log. */
export function ActivityTable({
  query,
  page,
  onPage,
  filtered,
  showBusiness = false,
}: {
  query: { isPending: boolean; isError: boolean; error: unknown; data?: Paginated<AuditEntry>; refetch: () => unknown }
  page: number
  onPage: (page: number) => void
  filtered: boolean
  showBusiness?: boolean
}) {
  if (query.isPending) return <Spinner label="Loading activity…" />
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />
  const data = query.data!
  if (data.results.length === 0) {
    return (
      <EmptyState icon={History} title={filtered ? 'No activity matches your filters' : 'No activity recorded yet'}
        description={filtered ? 'Try a different date range, action or person.' : 'Changes to catalogues, products, enquiries, team and billing are recorded here.'} />
    )
  }
  return (
    <>
      <div className="overflow-x-auto rounded-2xl bg-white shadow-panel">
        <table className="w-full text-left text-sm">
          <thead className="bg-thead text-[13px] font-semibold text-ink">
            <tr>
              <th scope="col" className="px-4 py-3">When</th>
              <th scope="col" className="px-3 py-3">Who</th>
              <th scope="col" className="px-3 py-3">Action</th>
              <th scope="col" className="px-3 py-3">Item &amp; changes</th>
              {showBusiness && <th scope="col" className="hidden px-3 py-3 lg:table-cell">Business</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.results.map((a) => {
              const actor = a.actor_name || ACTOR_FALLBACK[a.actor_type] || 'Unknown'
              return (
                <tr key={a.id} className="align-top">
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="block">{relativeTime(a.created_at)}</span>
                    <span className="text-xs text-muted">{formatDateTime(a.created_at)}</span>
                  </td>
                  <td className="px-3 py-3">
                    <span className="flex items-center gap-2">
                      <Avatar name={actor} />
                      <span className="min-w-0">
                        <span className="block max-w-40 truncate font-medium">{actor}</span>
                        {a.actor_type !== 'user' && <span className="text-xs text-muted">{a.actor_type === 'platform_admin' ? 'Platform' : ACTOR_FALLBACK[a.actor_type]}</span>}
                      </span>
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <span className="rounded-md bg-brand-50 px-2 py-0.5 text-xs font-medium whitespace-nowrap text-brand-800">{actionLabel(a.action)}</span>
                  </td>
                  <td className="px-3 py-3">
                    <span className="font-medium">{a.target_label || '—'}</span>
                    <ChangeList changes={a.changes} />
                  </td>
                  {showBusiness && <td className="hidden px-3 py-3 text-muted lg:table-cell">{a.business_name || (a.scope === 'account' ? 'Account security' : 'Platform')}</td>}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
        <span>Showing {(data.page - 1) * data.page_size + 1} to {Math.min(data.page * data.page_size, data.count)} of {data.count} entries</span>
        <Pagination page={page} totalPages={data.total_pages} count={data.count} onPage={onPage} />
      </div>
    </>
  )
}
