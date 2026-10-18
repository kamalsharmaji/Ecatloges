import { Link, Outlet } from 'react-router-dom'
import { Logo } from '@/components/Logo'
import { UserMenu } from '@/components/UserMenu'

/** Signed-in pages that live outside a business (business picker, onboarding, invitations). */
export function PlainLayout() {
  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-white">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
          <Link to="/businesses">
            <Logo />
          </Link>
          <UserMenu />
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8 sm:py-12">
        <Outlet />
      </main>
    </div>
  )
}
