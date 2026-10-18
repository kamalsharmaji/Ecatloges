import { Link } from 'react-router-dom'
import { Logo } from '@/components/Logo'

/** Placeholder until the business provides its legal terms (tracked in README "Known limitations"). */
export function TermsPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <Link to="/">
        <Logo />
      </Link>
      <h1 className="mt-10 text-2xl font-bold">Terms and conditions</h1>
      <p className="mt-3 text-muted">
        The full terms and conditions for myEcatalogues will be published on this page before launch.
      </p>
    </main>
  )
}
