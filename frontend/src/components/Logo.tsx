import { useId } from 'react'
import { cn } from '@/utils/cn'

/** Round blue emblem with a white "e" swoosh, as in the UI reference header. */
export function LogoMark({ className }: { className?: string }) {
  const id = useId()
  return (
    <svg viewBox="0 0 40 40" className={cn('size-10 shrink-0', className)} aria-hidden>
      <defs>
        <linearGradient id={`${id}-g`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2f8cff" />
          <stop offset="1" stopColor="#0048d8" />
        </linearGradient>
      </defs>
      <circle cx="20" cy="20" r="19" fill={`url(#${id}-g)`} />
      <path d="M3.5 24c6-1.5 22-2 33-7.5" stroke="#fff" strokeOpacity=".35" strokeWidth="2" fill="none" />
      <path
        d="M12.5 20.5h14.5a7.6 7.6 0 1 0-2.1 5.4"
        fill="none"
        stroke="#fff"
        strokeWidth="3.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** Book emblem used by the Super Admin panel in the reference. */
function AdminMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={cn('size-10 shrink-0', className)} aria-hidden>
      <path d="M4 9.5c5.5-1.6 10.7-.9 15 2.2v22.6c-4.3-3-9.5-3.7-15-2.1z" fill="#1f78fe" />
      <path d="M36 9.5c-5.5-1.6-10.7-.9-15 2.2v22.6c4.3-3 9.5-3.7 15-2.1z" fill="#0b55d9" />
      <path d="M7 6.5c4.6-1 8.8-.2 12 2.3M33 6.5c-4.6-1-8.8-.2-12 2.3" stroke="#0566f5" strokeWidth="2.2" fill="none" strokeLinecap="round" />
    </svg>
  )
}

export function Logo({
  inverted = false,
  admin = false,
  className,
}: {
  inverted?: boolean
  admin?: boolean
  className?: string
}) {
  return (
    <span className={cn('inline-flex items-center gap-2 font-extrabold tracking-tight', className)}>
      {admin ? <AdminMark /> : <LogoMark className="size-9" />}
      <span className={cn('text-[22px] leading-none', inverted ? 'text-white' : 'text-ink')}>
        my<span className={inverted ? 'text-brand-200' : 'text-brand-700'}>E</span>catalogues
      </span>
    </span>
  )
}
