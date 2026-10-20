import { Eye, EyeOff, type LucideIcon } from 'lucide-react'
import {
  forwardRef,
  useId,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { cn } from '@/utils/cn'

const controlBase =
  'block w-full rounded-lg border bg-white px-3 text-sm text-ink placeholder:text-[#8d98b8] transition-colors ' +
  'focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20 disabled:bg-canvas disabled:text-muted'

function controlClasses(invalid: boolean, extra?: string) {
  return cn(controlBase, invalid ? 'border-red-400' : 'border-[#d5e5fa]', extra)
}

interface FieldShellProps {
  id: string
  label: string
  error?: string
  hint?: ReactNode
  required?: boolean
  children: ReactNode
  className?: string
}

function FieldShell({ id, label, error, hint, required, children, className, hideLabel }: FieldShellProps & { hideLabel?: boolean }) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={id} className={cn('block text-sm font-medium text-ink', hideLabel && 'sr-only')}>
        {label}
        {required && <span className="ml-0.5 text-red-600" aria-hidden>*</span>}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-xs text-red-600">
          {error}
        </p>
      ) : (
        hint && <p id={`${id}-hint`} className="text-xs text-muted">{hint}</p>
      )}
    </div>
  )
}

interface CommonProps {
  label: string
  error?: string
  hint?: ReactNode
  containerClassName?: string
}

export const TextField = forwardRef<
  HTMLInputElement,
  CommonProps & InputHTMLAttributes<HTMLInputElement> & { icon?: LucideIcon; hideLabel?: boolean }
>(
  function TextField({ label, error, hint, containerClassName, className, id, required, type, icon: Icon, hideLabel, ...props }, ref) {
    const autoId = useId()
    const fieldId = id ?? autoId
    const [reveal, setReveal] = useState(false)
    const isPassword = type === 'password'
    return (
      <FieldShell id={fieldId} label={label} error={error} hint={hint} required={required} className={containerClassName} hideLabel={hideLabel}>
        <div className="relative">
          {Icon && <Icon className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-ink/70" aria-hidden />}
          <input
            ref={ref}
            id={fieldId}
            type={isPassword && reveal ? 'text' : type}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined}
            className={controlClasses(Boolean(error), cn('h-10', Icon && 'pl-11', isPassword && 'pr-10', className))}
            {...props}
          />
          {isPassword && (
            <button
              type="button"
              onClick={() => setReveal((r) => !r)}
              className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted hover:text-ink"
              aria-label={reveal ? 'Hide password' : 'Show password'}
            >
              {reveal ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          )}
        </div>
      </FieldShell>
    )
  },
)

export const SelectField = forwardRef<HTMLSelectElement, CommonProps & SelectHTMLAttributes<HTMLSelectElement>>(
  function SelectField({ label, error, hint, containerClassName, className, id, required, children, ...props }, ref) {
    const autoId = useId()
    const fieldId = id ?? autoId
    return (
      <FieldShell id={fieldId} label={label} error={error} hint={hint} required={required} className={containerClassName}>
        <select
          ref={ref}
          id={fieldId}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${fieldId}-error` : undefined}
          className={controlClasses(Boolean(error), cn('h-10 pr-8', className))}
          {...props}
        >
          {children}
        </select>
      </FieldShell>
    )
  },
)

export const TextAreaField = forwardRef<HTMLTextAreaElement, CommonProps & TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function TextAreaField({ label, error, hint, containerClassName, className, id, required, ...props }, ref) {
    const autoId = useId()
    const fieldId = id ?? autoId
    return (
      <FieldShell id={fieldId} label={label} error={error} hint={hint} required={required} className={containerClassName}>
        <textarea
          ref={ref}
          id={fieldId}
          aria-invalid={Boolean(error)}
          className={controlClasses(Boolean(error), cn('min-h-24 py-2', className))}
          {...props}
        />
      </FieldShell>
    )
  },
)

export const Checkbox = forwardRef<
  HTMLInputElement,
  { label: ReactNode; error?: string } & Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>
>(function Checkbox({ label, error, id, className, ...props }, ref) {
  const autoId = useId()
  const fieldId = id ?? autoId
  return (
    <div className={className}>
      <label htmlFor={fieldId} className="flex items-start gap-2.5 text-sm text-ink">
        <input
          ref={ref}
          id={fieldId}
          type="checkbox"
          aria-invalid={Boolean(error)}
          className="mt-0.5 size-4 rounded border-border text-brand-700 accent-brand-700"
          {...props}
        />
        <span>{label}</span>
      </label>
      {error && (
        <p role="alert" className="mt-1 text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  )
})
