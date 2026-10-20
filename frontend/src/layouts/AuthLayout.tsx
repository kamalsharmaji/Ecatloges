import authArt from '@/assets/reference/auth-devices.webp'
import { BarChart3, Headphones, Images, Layers, MonitorSmartphone, QrCode, ShieldCheck, Users, Zap, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { Logo } from '@/components/Logo'

const FEATURES: { icon: LucideIcon; text: string }[] = [
  { icon: Layers, text: 'Manage Multiple Catalogues' },
  { icon: Images, text: 'Upload High-Quality Photos & Videos' },
  { icon: BarChart3, text: 'Track Views & Enquiries' },
  { icon: QrCode, text: 'Share via QR Code & WhatsApp' },
  { icon: Users, text: 'Manage Team Members' },
]

const STRIP: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: ShieldCheck, title: 'Secure & Safe', text: 'Your data is protected' },
  { icon: Zap, title: 'Fast & Easy', text: 'Simple and quick access' },
  { icon: MonitorSmartphone, title: 'Works on All Devices', text: 'Desktop, tablet and mobile' },
  { icon: Headphones, title: 'Help & Support', text: 'Raise a ticket any time' },
]

/** Copy for the marketing column per auth route (reference p6 login, p5 registration). */
function intro(pathname: string) {
  if (pathname.startsWith('/register')) {
    return { badge: 'Get Started', title: <>Create Your <span className="text-brand-700">Business Catalogue</span> in Minutes</>, text: 'Showcase your products with high-quality photos and videos. Get QR codes, share links and grow your business.' }
  }
  if (pathname.startsWith('/forgot-password') || pathname.startsWith('/reset-password')) {
    return { badge: 'Account Help', title: <>Reset Your <span className="text-brand-700">myEcatalogues</span> Password</>, text: 'We will email you a secure link to choose a new password.' }
  }
  return { badge: 'Welcome Back', title: <>Login to Your <span className="text-brand-700">myEcatalogues</span> Account</>, text: 'Access your business dashboard, manage your catalogues, products, media and grow your business.' }
}

export function AuthLayout() {
  const { pathname } = useLocation()
  const onRegister = pathname.startsWith('/register')
  const copy = intro(pathname)
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_70%_10%,#dcecff_0%,#eef6fd_45%,#e6f1fd_100%)] px-3 py-6 sm:px-6 lg:py-10">
      <div className="mx-auto max-w-[1140px] overflow-hidden rounded-[28px] bg-white/70 shadow-[0_20px_60px_-30px_rgb(16_42_99/0.35)] backdrop-blur">
        <header className="flex items-center justify-between gap-4 border-b border-[#e6eef8] bg-white px-6 py-4 sm:px-12">
          <Link to="/" aria-label="myEcatalogues home"><Logo /></Link>
          <p className="hidden text-[14px] text-ink sm:block">
            {onRegister ? 'Already have an account?' : 'New to myEcatalogues?'}{' '}
            <Link to={onRegister ? '/login' : '/register'} className="font-medium text-brand-700 underline underline-offset-2">
              {onRegister ? 'Login' : 'Create an Account'}
            </Link>
          </p>
        </header>
        <div className="grid gap-8 px-5 py-8 sm:px-12 lg:grid-cols-[minmax(0,1fr)_400px] lg:py-10">
          <section className="hidden min-w-0 lg:block">
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1 text-[13px] font-medium text-brand-800 shadow-sm">
              <ShieldCheck className="size-4 text-brand-700" aria-hidden /> {copy.badge}
            </span>
            <h1 className="mt-5 text-[40px] leading-[1.12] font-extrabold tracking-tight text-ink">{copy.title}</h1>
            <p className="mt-4 max-w-[460px] text-[16px] leading-relaxed text-body">{copy.text}</p>
            <div className="relative mt-6 flex items-start gap-4">
              <ul className="relative z-10 space-y-4">
                {FEATURES.map(({ icon: Icon, text }) => (
                  <li key={text} className="flex items-center gap-3 text-[14.5px] text-ink">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-700 text-white shadow-pill"><Icon className="size-5" aria-hidden /></span>
                    {text}
                  </li>
                ))}
              </ul>
              <img src={authArt} alt="" aria-hidden className="pointer-events-none -mt-6 ml-auto hidden w-[360px] min-w-0 xl:block xl:[mask-image:radial-gradient(closest-side,black_80%,transparent)]" />
            </div>
          </section>
          <section className="rounded-3xl bg-white p-6 shadow-[0_10px_40px_-20px_rgb(16_42_99/0.35)] sm:p-8">
            <div className="mb-5 flex justify-center"><Logo /></div>
            <Outlet />
          </section>
        </div>
        <ul className="hidden grid-cols-4 gap-4 border-t border-[#e6eef8] bg-white px-12 py-6 lg:grid">
          {STRIP.map(({ icon: Icon, title, text }) => (
            <li key={title} className="flex items-center gap-3">
              <span className="flex size-12 items-center justify-center rounded-full bg-[#eaf2fe] text-brand-700"><Icon className="size-6" aria-hidden /></span>
              <span>
                <span className="block text-[15px] font-semibold text-ink">{title}</span>
                <span className="block text-[13px] text-body">{text}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

export function AuthHeading({ title, subtitle }: { title: string; subtitle?: ReactNode }) {
  return (
    <div className="mb-6 text-center">
      <h1 className="text-[24px] font-bold tracking-tight text-ink">{title}</h1>
      {subtitle && <p className="mt-1.5 text-[14px] text-body">{subtitle}</p>}
    </div>
  )
}
