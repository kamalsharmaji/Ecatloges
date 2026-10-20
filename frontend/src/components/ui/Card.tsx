import type { ReactNode } from 'react'
import { cn } from '@/utils/cn'

/** White panel card from the UI reference: 16 px radius, soft shadow, no outline. */
export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cn('rounded-2xl bg-surface shadow-panel', className)}>{children}</section>
}

export function CardHeader({
  title,
  description,
  action,
}: {
  title: string
  description?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4 pb-3">
      <div>
        <h2 className="text-[17px] font-bold tracking-tight text-ink">{title}</h2>
        {description && <p className="mt-0.5 text-[13px] text-body">{description}</p>}
      </div>
      {action}
    </div>
  )
}

export function CardBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('px-5 pt-1 pb-5', className)}>{children}</div>
}

export function PageHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[26px] font-bold tracking-tight text-ink">{title}</h1>
        {description && <p className="mt-1 text-[15px] text-body">{description}</p>}
      </div>
      {action}
    </div>
  )
}
