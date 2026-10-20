import { Mail, MessageCircle, Phone } from 'lucide-react'
import { avatarTone, ENQUIRY_STATUS, initials, whatsappHref } from '@/features/leads/leadFormat'
import type { EnquiryStatus } from '@/types/leads'
import { cn } from '@/utils/cn'

export function EnquiryStatusPill({ status }: { status: EnquiryStatus }) {
  const s = ENQUIRY_STATUS[status]
  return <span className={cn('inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap', s.className)}>{s.label}</span>
}

export function Avatar({ name, size = 'md' }: { name: string; size?: 'md' | 'lg' }) {
  return (
    <span className={cn('flex shrink-0 items-center justify-center rounded-full font-semibold', avatarTone(name), size === 'lg' ? 'size-12 text-base' : 'size-9 text-sm')}>
      {initials(name)}
    </span>
  )
}

/** WhatsApp / email / call shortcuts (reference: 32 px tinted squares). Each opens the user's own app; nothing is sent by the server. */
export function ContactActions({ phone, email, message }: { phone: string; email?: string; message?: string }) {
  const box = 'flex size-8 items-center justify-center rounded-lg'
  return (
    <div className="flex items-center gap-1.5">
      {phone && (
        <a href={whatsappHref(phone, message)} target="_blank" rel="noreferrer" aria-label="Reply on WhatsApp" title="Reply on WhatsApp"
          className={cn(box, 'bg-[#dcf7e5] text-[#16a34a] hover:bg-[#c6f0d5]')}>
          <MessageCircle className="size-[18px]" fill="currentColor" fillOpacity={0.15} />
        </a>
      )}
      {email && (
        <a href={`mailto:${email}`} aria-label="Send email" title="Send email" className={cn(box, 'bg-[#eef4fd] text-brand-700 hover:bg-[#dcebfd]')}>
          <Mail className="size-[18px]" />
        </a>
      )}
      {phone && (
        <a href={`tel:${phone}`} aria-label="Call" title="Call" className={cn(box, 'bg-[#eef4fd] text-brand-700 hover:bg-[#dcebfd]')}>
          <Phone className="size-[18px]" fill="currentColor" fillOpacity={0.15} />
        </a>
      )}
    </div>
  )
}
