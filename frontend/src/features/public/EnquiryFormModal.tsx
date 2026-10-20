import { zodResolver } from '@hookform/resolvers/zod'
import { CircleCheck, MessageCircle, Send, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { submitPublicEnquiry } from '@/api/leads'
import { ApiError } from '@/api/client'
import type { TrafficSource } from '@/types/leads'
import { applyApiErrors } from '@/utils/formErrors'

const schema = z.object({
  name: z.string().trim().min(2, 'Enter your name.').max(150),
  phone: z.string().trim().regex(/^\+?[0-9][0-9\s\-()]{6,18}$/, 'Enter a valid mobile number.'),
  email: z.union([z.literal(''), z.string().trim().email('Enter a valid email.')]),
  quantity: z.string().trim().regex(/^$|^[1-9]\d{0,6}$/, 'Enter a whole number.'),
  message: z.string().trim().min(2, 'Tell us what you need.').max(2000),
  website: z.string(), // honeypot — hidden from people, filled by bots
})
type FormValues = z.infer<typeof schema>

const ENQUIRY_SOURCE: Record<TrafficSource, string> = {
  direct: 'catalogue', other: 'catalogue', qr_code: 'qr_code', whatsapp: 'whatsapp', social: 'social', search: 'search',
}

export interface EnquiryTarget {
  productId: string | null
  productName: string | null
}

const field = 'mt-1 block h-10 w-full rounded-lg border border-slate-200 px-3 text-sm focus:border-[var(--brand)] focus:outline-none'

export function EnquiryFormModal({ businessSlug, catalogueSlug, target, source, whatsappHref, onClose }: {
  businessSlug: string
  catalogueSlug: string
  target: EnquiryTarget
  source: TrafficSource
  whatsappHref: string | null
  onClose: () => void
}) {
  const openedAt = useRef(Date.now())
  // One key per form instance: double clicks and network retries can't create duplicates.
  const idempotencyKey = useRef(crypto.randomUUID())
  const [done, setDone] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '', phone: '', email: '', quantity: '', website: '',
      message: target.productName ? `Hi, I'm interested in "${target.productName}". Please share price and availability.` : '',
    },
  })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const onSubmit = handleSubmit(async (v) => {
    setFormError(null)
    try {
      const result = await submitPublicEnquiry(businessSlug, catalogueSlug, {
        name: v.name, phone: v.phone, email: v.email, message: v.message,
        quantity: v.quantity ? Number(v.quantity) : null,
        product_id: target.productId,
        source: ENQUIRY_SOURCE[source],
        idempotency_key: idempotencyKey.current,
        website: v.website,
        elapsed_ms: Date.now() - openedAt.current,
      })
      setDone(result.reference)
    } catch (error) {
      if (error instanceof ApiError && error.status === 429) setFormError('Too many enquiries were sent from this connection. Please try again in a minute.')
      else setFormError(applyApiErrors(error, setError, ['name', 'phone', 'email', 'quantity', 'message']))
    }
  })

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-900/50 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="enquiry-title" onClick={onClose}>
      <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 id="enquiry-title" className="text-lg font-bold">{target.productName ? 'Enquire about product' : 'Send an enquiry'}</h2>
            {target.productName && <p className="text-sm text-slate-500">{target.productName}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100"><X className="size-5" /></button>
        </div>
        {done ? (
          <div className="py-6 text-center" role="status">
            <CircleCheck className="mx-auto size-12 text-emerald-600" aria-hidden />
            <p className="mt-3 text-lg font-semibold">Enquiry sent!</p>
            <p className="mt-1 text-sm text-slate-600">The business will contact you soon.{done !== '—' && <> Reference: <span className="font-mono">{done}</span></>}</p>
            <button type="button" onClick={onClose} className="mt-5 rounded-lg bg-[var(--brand)] px-5 py-2 text-sm font-medium text-white">Close</button>
          </div>
        ) : (
          <form onSubmit={onSubmit} noValidate className="space-y-3">
            {formError && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>}
            {/* Honeypot: invisible to people and screen readers. */}
            <div aria-hidden="true" className="absolute -left-[9999px] h-0 overflow-hidden">
              <label>Website <input tabIndex={-1} autoComplete="off" {...register('website')} /></label>
            </div>
            <label className="block text-sm font-medium">Your name *
              <input autoComplete="name" className={field} aria-invalid={Boolean(errors.name)} {...register('name')} />
              {errors.name && <span className="text-xs text-red-600">{errors.name.message}</span>}
            </label>
            <label className="block text-sm font-medium">Mobile number *
              <input type="tel" autoComplete="tel" placeholder="+91 98765 43210" className={field} aria-invalid={Boolean(errors.phone)} {...register('phone')} />
              {errors.phone && <span className="text-xs text-red-600">{errors.phone.message}</span>}
            </label>
            <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-3">
              <label className="block text-sm font-medium">Email <span className="font-normal text-slate-500">(optional)</span>
                <input type="email" autoComplete="email" className={field} {...register('email')} />
                {errors.email && <span className="text-xs text-red-600">{errors.email.message}</span>}
              </label>
              <label className="block text-sm font-medium">Quantity
                <input inputMode="numeric" className={field} {...register('quantity')} />
                {errors.quantity && <span className="text-xs text-red-600">{errors.quantity.message}</span>}
              </label>
            </div>
            <label className="block text-sm font-medium">Message *
              <textarea rows={4} maxLength={2000} className={`${field} h-auto py-2`} aria-invalid={Boolean(errors.message)} {...register('message')} />
              {errors.message && <span className="text-xs text-red-600">{errors.message.message}</span>}
            </label>
            <button type="submit" disabled={isSubmitting} className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--brand)] px-4 py-2.5 font-medium text-white hover:opacity-90 disabled:opacity-60">
              <Send className="size-4" aria-hidden /> {isSubmitting ? 'Sending…' : 'Send Enquiry'}
            </button>
            {whatsappHref && (
              <a href={whatsappHref} target="_blank" rel="noreferrer" className="flex w-full items-center justify-center gap-2 rounded-lg border border-emerald-300 px-4 py-2.5 text-sm font-medium text-emerald-700 hover:bg-emerald-50">
                <MessageCircle className="size-4" aria-hidden /> Chat on WhatsApp
              </a>
            )}
            <p className="text-center text-xs text-slate-500">Your details are shared only with this business.</p>
          </form>
        )}
      </div>
    </div>
  )
}
