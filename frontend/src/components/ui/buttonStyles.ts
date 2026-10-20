import { cn } from '@/utils/cn'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'soft'
export type ButtonSize = 'sm' | 'md' | 'lg'

// Reference buttons: solid #0566F5 primary, white outlined secondary, tinted "soft" (card actions).
const variants: Record<ButtonVariant, string> = {
  primary: 'bg-brand-700 text-white hover:bg-brand-800 shadow-[0_6px_14px_-8px_rgb(5_102_245/0.8)]',
  secondary: 'bg-white text-brand-800 border border-[#c9dcf7] hover:bg-brand-50',
  ghost: 'text-muted hover:bg-brand-50 hover:text-brand-800',
  danger: 'bg-red-600 text-white hover:bg-red-700 shadow-sm',
  soft: 'bg-[#e3effd] text-brand-800 hover:bg-[#d3e6fd]',
}

const sizes: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-[16px] gap-2',
}

/** 32 px tinted square used for icon-only row actions in reference tables (eye / pencil / ⋯). */
export const rowIconButton =
  'inline-flex size-8 items-center justify-center rounded-lg bg-[#eef4fd] text-brand-700 hover:bg-[#dcebfd] disabled:opacity-50'

/** Category / plan chip colours that cycle by name, as in the reference tables. */
const CHIP_TONES = [
  'bg-[#e0ebff] text-[#1f5fe0]',
  'bg-[#fff1d6] text-[#c2620a]',
  'bg-[#ffe4ef] text-[#d6336c]',
  'bg-[#efe4ff] text-[#7c3aed]',
  'bg-[#dcf7e5] text-[#14a04a]',
]
export const chipTone = (seed: string) => CHIP_TONES[[...seed].reduce((a, c) => a + c.charCodeAt(0), 0) % CHIP_TONES.length]

/** Shared by <Button> and by links styled as buttons. */
export function buttonClasses(variant: ButtonVariant = 'primary', size: ButtonSize = 'md', className?: string) {
  return cn(
    'inline-flex items-center justify-center rounded-lg font-medium transition-colors',
    'disabled:cursor-not-allowed disabled:opacity-60',
    variants[variant],
    sizes[size],
    className,
  )
}
