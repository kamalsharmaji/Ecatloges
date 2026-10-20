import { useEffect } from 'react'
import { useAuth } from '@/features/auth/AuthContext'
import { PRICING, showBlock, STATS, TESTIMONIALS } from '@/features/landing/content'
import { Faq, FinalCta, Industries, LandingFooter, Pricing, StatsBar, Testimonials } from '@/features/landing/LandingBottom'
import { CategoryStrip, DeviceShowcase, Features, Hero, HowItWorks, LandingHeader } from '@/features/landing/LandingTop'

/** Marketing landing page (sections in the order of the approved UI reference). */
export function HomePage() {
  const { status } = useAuth()
  const signedIn = status === 'authenticated'
  // Signed-in visitors go straight to their businesses; everyone else signs up first.
  const ctaHref = signedIn ? '/businesses' : '/register'
  const planHref = signedIn ? '/businesses' : '/register'

  useEffect(() => {
    document.title = 'myEcatalogues — Showcase Your Products. Grow Your Business.'
  }, [])

  return (
    <div id="top" className="min-h-screen overflow-x-clip bg-white font-sans text-lp-ink">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-white focus:px-3 focus:py-2">Skip to content</a>
      <LandingHeader signedIn={signedIn} />
      <main id="main">
        <Hero ctaHref={ctaHref} />
        <CategoryStrip />
        <Features />
        <HowItWorks />
        <DeviceShowcase />
        {showBlock(STATS) && <StatsBar />}
        <Industries />
        {showBlock(PRICING) && <Pricing planHref={planHref} />}
        {showBlock(TESTIMONIALS) && <Testimonials />}
        <Faq />
        <FinalCta ctaHref={ctaHref} />
      </main>
      <LandingFooter />
    </div>
  )
}
