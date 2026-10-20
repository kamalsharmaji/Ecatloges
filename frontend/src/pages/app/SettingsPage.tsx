import heroArt from '@/assets/reference/hero-settings.webp'
import { Bell, BookOpen, Building2, Palette, Settings, UserRound, Users, type LucideIcon } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { PageHero } from '@/components/panel/PageHero'
import { useActiveBusiness } from '@/features/business/BusinessContext'
import {
  AccountBillingTab,
  BrandingTab,
  CatalogueDefaultsTab,
  NotificationsTab,
  ProfileTab,
  StaffTab,
} from '@/features/settings/SettingsTabs'
import { cn } from '@/utils/cn'

type Tab = { key: string; label: string; icon: LucideIcon; requires?: string; render: () => React.ReactNode }

// Tabs follow the Settings screen in the UI reference. Domain & SEO, Payment Settings and per-business
// email templates have no backing feature yet and are intentionally not shown.
const TABS: Tab[] = [
  { key: 'profile', label: 'Business Profile', icon: Building2, requires: 'business.view', render: () => <ProfileTab /> },
  { key: 'branding', label: 'Branding & Design', icon: Palette, requires: 'business.view', render: () => <BrandingTab /> },
  { key: 'catalogue', label: 'Catalogue Settings', icon: BookOpen, requires: 'business.view', render: () => <CatalogueDefaultsTab /> },
  { key: 'staff', label: 'Staff & Permissions', icon: Users, render: () => <StaffTab /> },
  { key: 'notifications', label: 'Notifications', icon: Bell, render: () => <NotificationsTab /> },
  { key: 'account', label: 'Account & Billing', icon: UserRound, render: () => <AccountBillingTab /> },
]

export function SettingsPage() {
  const { can } = useActiveBusiness()
  const [params, setParams] = useSearchParams()
  const tabs = TABS.filter((t) => !t.requires || can(t.requires))
  const active = tabs.find((t) => t.key === params.get('tab')) ?? tabs[0]!

  return (
    <>
      <PageHero icon={Settings} title="Settings" illustration={heroArt}
        description="Manage your business profile, branding, catalogue defaults and how you are notified. Customise your myEcatalogues experience." />
      {/* Reference: white strip, blue text + 3 px underline on the active tab. */}
      <div role="tablist" aria-label="Settings sections" className="mb-4 flex gap-2 overflow-x-auto rounded-2xl bg-white px-3 shadow-panel">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button key={key} type="button" role="tab" id={`tab-${key}`} aria-selected={active.key === key} aria-controls={`panel-${key}`}
            onClick={() => setParams({ tab: key }, { replace: true })}
            className={cn('flex h-14 shrink-0 items-center gap-2 border-b-[3px] px-3.5 text-sm font-medium whitespace-nowrap',
              active.key === key ? 'border-brand-700 text-brand-700' : 'border-transparent text-ink hover:text-brand-700')}>
            <Icon className="size-4" aria-hidden /> {label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${active.key}`} aria-labelledby={`tab-${active.key}`}>{active.render()}</div>
    </>
  )
}
