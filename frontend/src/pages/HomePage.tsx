import { CircleAlert, CircleCheck, LoaderCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useHealthCheck } from '@/api/system'
import { Logo } from '@/components/Logo'
import { buttonClasses } from '@/components/ui/buttonStyles'
import { useAuth } from '@/features/auth/AuthContext'

/** Minimal landing page. Replaced by the full marketing site in Phase 9. */
export function HomePage() {
  const { status } = useAuth()
  const health = useHealthCheck()

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Logo />
        <nav className="flex items-center gap-2">
          {status === 'authenticated' ? (
            <Link to="/businesses" className={buttonClasses('primary', 'md')}>
              Go to dashboard
            </Link>
          ) : (
            <>
              <Link to="/login" className={buttonClasses('ghost', 'md')}>
                Sign in
              </Link>
              <Link to="/register" className={buttonClasses('primary', 'md')}>
                Get started
              </Link>
            </>
          )}
        </nav>
      </header>

      <main className="mx-auto flex max-w-3xl flex-col items-center px-4 py-20 text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Digital catalogues that <span className="text-brand-700">sell</span>.
        </h1>
        <p className="mt-4 max-w-xl text-lg text-muted">
          Create beautiful product catalogues, share them with a link or QR code, and turn views into enquiries.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link to="/register" className={buttonClasses('primary', 'lg')}>
            Create your free account
          </Link>
          <Link to="/login" className={buttonClasses('secondary', 'lg')}>
            Sign in
          </Link>
        </div>

        <p aria-live="polite" className="mt-16 flex items-center gap-2 text-xs text-muted">
          {health.isPending && (
            <>
              <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> Checking service status…
            </>
          )}
          {health.isError && (
            <>
              <CircleAlert className="size-3.5 text-red-600" aria-hidden /> Service unavailable: {health.error.message}
            </>
          )}
          {health.isSuccess && (
            <>
              <CircleCheck className="size-3.5 text-emerald-600" aria-hidden /> All systems operational
            </>
          )}
        </p>
      </main>
    </div>
  )
}
