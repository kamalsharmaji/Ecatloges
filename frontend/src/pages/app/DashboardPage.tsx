import { ShieldCheck, Store, UserRound, Users, type LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Card, CardBody, PageHeader } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Feedback'
import { useAuth } from '@/features/auth/AuthContext'
import { useActiveBusiness } from '@/features/business/BusinessContext'
import { categoryLabel } from '@/features/business/constants'

interface QuickLink {
  to: string
  title: string
  text: string
  icon: LucideIcon
  requires?: string
}

const LINKS: QuickLink[] = [
  { to: '/app/business', title: 'Business profile', text: 'Contact details shown on your catalogues.', icon: Store, requires: 'business.view' },
  { to: '/app/team', title: 'Team', text: 'Invite staff and manage their access.', icon: Users, requires: 'member.view' },
  { to: '/app/roles', title: 'Roles & permissions', text: 'Control exactly what each role can do.', icon: ShieldCheck, requires: 'role.view' },
  { to: '/app/account', title: 'My account', text: 'Your profile, password and email.', icon: UserRound },
]

export function DashboardPage() {
  const { user } = useAuth()
  const { context, can } = useActiveBusiness()
  if (!context) return null
  const { business } = context

  return (
    <>
      <PageHeader
        title={`Welcome, ${user?.full_name.split(' ')[0] ?? ''}`}
        description="Catalogues, products, enquiries and analytics will appear here as they're set up."
      />
      <Card>
        <CardBody className="flex flex-wrap items-center gap-4">
          <span className="flex size-14 items-center justify-center rounded-xl bg-brand-700 text-2xl font-bold text-white">
            {business.name[0]?.toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-semibold">{business.name}</h2>
            <p className="text-sm text-muted">
              {categoryLabel(business.category)} · {business.city}
            </p>
          </div>
          <Badge tone={context.is_owner ? 'brand' : 'neutral'}>{context.role.name}</Badge>
        </CardBody>
      </Card>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {LINKS.filter((l) => !l.requires || can(l.requires)).map(({ to, title, text, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            className="group flex gap-4 rounded-xl border border-border bg-white p-5 shadow-sm transition hover:border-brand-300 hover:shadow"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700 group-hover:bg-brand-100">
              <Icon className="size-5" aria-hidden />
            </span>
            <span>
              <span className="block font-semibold">{title}</span>
              <span className="mt-0.5 block text-sm text-muted">{text}</span>
            </span>
          </Link>
        ))}
      </div>
    </>
  )
}
