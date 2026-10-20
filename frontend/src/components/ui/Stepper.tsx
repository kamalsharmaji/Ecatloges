import { Check } from 'lucide-react'
import { cn } from '@/utils/cn'

const SIGNUP_STEPS = ['Account', 'Verify', 'Business', 'Plan', 'Payment']

/** Numbered progress steps from the reference sign-up flow (done = green tick, current = blue). */
export function Stepper({ steps = SIGNUP_STEPS, current }: { steps?: string[]; current: number }) {
  return (
    <ol className="mb-6 flex items-start" aria-label="Progress">
      {steps.map((label, i) => {
        const state = i < current ? 'done' : i === current ? 'current' : 'todo'
        return (
          <li key={label} className="relative flex flex-1 flex-col items-center text-center" aria-current={state === 'current' ? 'step' : undefined}>
            {i > 0 && <span aria-hidden className={cn('absolute top-4 right-1/2 h-0.5 w-full', i <= current ? 'bg-brand-600' : 'bg-[#dbe6f5]')} />}
            <span className={cn('relative z-10 flex size-8 items-center justify-center rounded-full text-[13px] font-semibold',
              state === 'done' ? 'bg-[#22b45a] text-white' : state === 'current' ? 'bg-brand-700 text-white shadow-pill' : 'bg-[#eef3fa] text-ink ring-1 ring-[#dbe6f5]')}>
              {state === 'done' ? <Check className="size-4" aria-hidden /> : i + 1}
            </span>
            <span className={cn('mt-1.5 text-[11.5px]', state === 'current' ? 'font-semibold text-brand-800' : 'text-body')}>{label}</span>
          </li>
        )
      })}
    </ol>
  )
}
