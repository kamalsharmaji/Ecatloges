import type { EnquirySource, EnquiryStatus } from '@/types/leads'
import { dayMonthYearTime } from '@/utils/dates'

// Pastel status chips from the reference (ring classes kept transparent so existing `ring-1` users stay borderless).
export const ENQUIRY_STATUS: Record<EnquiryStatus, { label: string; className: string }> = {
  new: { label: 'New', className: 'bg-[#fff1d6] text-[#e8590c] ring-transparent' },
  contacted: { label: 'Contacted', className: 'bg-[#dcf7e5] text-[#14a04a] ring-transparent' },
  in_progress: { label: 'In Progress', className: 'bg-[#e0ebff] text-[#1f5fe0] ring-transparent' },
  converted: { label: 'Converted', className: 'bg-[#efe4ff] text-[#7c3aed] ring-transparent' },
  closed: { label: 'Closed', className: 'bg-[#ffe1e8] text-[#e11d48] ring-transparent' },
}

export const STATUS_ORDER: EnquiryStatus[] = ['new', 'contacted', 'in_progress', 'converted', 'closed']

export const ENQUIRY_SOURCE: Record<EnquirySource, string> = {
  catalogue: 'Catalogue link',
  qr_code: 'QR Code',
  whatsapp: 'WhatsApp',
  social: 'Social media',
  search: 'Search',
  manual: 'Manual',
}

export const formatDateTime = (iso: string | null | undefined) => (iso ? dayMonthYearTime(new Date(iso)) : '—')

/** wa.me expects digits only, in international format. */
export const whatsappHref = (phone: string, text = '') =>
  `https://wa.me/${phone.replace(/\D/g, '')}${text ? `?text=${encodeURIComponent(text)}` : ''}`

export const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('') || '?'

// Solid initial avatars as in the reference enquiry lists.
const AVATAR_TONES = ['bg-[#4f7df5] text-white', 'bg-[#a35cf0] text-white', 'bg-[#ec4f9c] text-white', 'bg-[#22b45a] text-white', 'bg-[#f59e0b] text-white']
export const avatarTone = (seed: string) => AVATAR_TONES[[...seed].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_TONES.length]
