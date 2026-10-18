import { BookOpen } from 'lucide-react'
import { cn } from '@/utils/cn'

export function Logo({ inverted = false, className }: { inverted?: boolean; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2 font-bold tracking-tight', className)}>
      <span
        className={cn(
          'flex size-8 items-center justify-center rounded-lg',
          inverted ? 'bg-white text-brand-700' : 'bg-brand-700 text-white',
        )}
      >
        <BookOpen className="size-4.5" aria-hidden />
      </span>
      <span className={inverted ? 'text-white' : 'text-ink'}>
        my<span className={inverted ? 'text-brand-200' : 'text-brand-700'}>E</span>catalogues
      </span>
    </span>
  )
}
