/** Landing page navigation targets and shared button styles (kept out of component files). */

export const NAV_LINKS = [
  { href: '#features', label: 'Features' },
  { href: '#how-it-works', label: 'How It Works' },
  { href: '#solutions', label: 'Solutions' },
  { href: '#pricing', label: 'Pricing' },
  { href: '#faq', label: 'FAQs' },
]

/**
 * Footer columns. `to` = in-app route, `href` = same-page anchor. Items with neither have no page
 * yet and render as plain text (no invented destinations).
 */
export const FOOTER_COLUMNS: { title: string; links: { label: string; to?: string; href?: string }[] }[] = [
  {
    title: 'Product',
    links: [
      { label: 'Features', href: '#features' },
      { label: 'How It Works', href: '#how-it-works' },
      { label: 'Pricing', href: '#pricing' },
      { label: 'Solutions', href: '#solutions' },
    ],
  },
  {
    title: 'Support',
    links: [
      { label: 'Help Center', to: '/app/support' },
      { label: 'Contact Us', to: '/app/support' },
      { label: 'FAQs', href: '#faq' },
      { label: 'Report an Issue', to: '/app/support' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About Us' },
      { label: 'Privacy Policy' },
      { label: 'Terms & Conditions', to: '/terms' },
      { label: 'Refund Policy' },
    ],
  },
]

/** Social profiles: add the real URLs here; icons without a URL are shown but not linked. */
export const SOCIAL_LINKS: Record<'facebook' | 'instagram' | 'youtube' | 'linkedin', string | null> = {
  facebook: null,
  instagram: null,
  youtube: null,
  linkedin: null,
}

/** Primary CTA: vivid blue gradient. */
export const ctaPrimary =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-lp-primary to-lp-secondary px-6 py-3.5 text-sm font-semibold text-white shadow-[0_10px_24px_-10px_rgb(8_102_245/0.7)] transition hover:-translate-y-0.5 hover:shadow-[0_14px_28px_-10px_rgb(8_102_245/0.75)] focus-visible:outline-lp-primary'
