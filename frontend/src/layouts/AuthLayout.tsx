import { BarChart3, QrCode, Share2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, Outlet } from 'react-router-dom'
import { Logo } from '@/components/Logo'

const highlights = [
  { icon: Share2, text: 'Share catalogues with a link or on WhatsApp' },
  { icon: QrCode, text: 'Print QR codes for your shop and packaging' },
  { icon: BarChart3, text: 'See which products customers look at' },
]

export function AuthLayout() {
  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-brand-800 via-brand-700 to-brand-600 p-10 text-white lg:flex lg:flex-col">
        <Link to="/">
          <Logo inverted />
        </Link>
        <div className="my-auto max-w-md">
          <h2 className="text-3xl font-bold leading-tight">Your products, beautifully catalogued.</h2>
          <p className="mt-3 text-brand-100">
            Build digital catalogues in minutes and turn every view into a customer enquiry.
          </p>
          <ul className="mt-8 space-y-4">
            {highlights.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-sm text-brand-50">
                <span className="flex size-9 items-center justify-center rounded-lg bg-white/10">
                  <Icon className="size-4.5" aria-hidden />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-brand-200">© {new Date().getFullYear()} myEcatalogues</p>
        <div className="pointer-events-none absolute -right-24 -bottom-24 size-80 rounded-full bg-white/5" aria-hidden />
      </aside>
      <main className="flex flex-col px-4 py-8 sm:px-8">
        <Link to="/" className="mb-8 lg:hidden">
          <Logo />
        </Link>
        <div className="mx-auto my-auto w-full max-w-md">
          <Outlet />
        </div>
      </main>
    </div>
  )
}

export function AuthHeading({ title, subtitle }: { title: string; subtitle?: ReactNode }) {
  return (
    <div className="mb-8">
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      {subtitle && <p className="mt-2 text-sm text-muted">{subtitle}</p>}
    </div>
  )
}
