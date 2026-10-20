import { createBrowserRouter, type RouteObject } from 'react-router-dom'
import { AppLayout } from '@/layouts/AppLayout'
import { AuthLayout } from '@/layouts/AuthLayout'
import { PlainLayout } from '@/layouts/PlainLayout'
import { AccountPage } from '@/pages/app/AccountPage'
import { BusinessProfilePage } from '@/pages/app/BusinessProfilePage'
import { DashboardPage } from '@/pages/app/DashboardPage'
import { RolesPage } from '@/pages/app/RolesPage'
import { TeamPage } from '@/pages/app/TeamPage'
import { ForgotPasswordPage } from '@/pages/auth/ForgotPasswordPage'
import { LoginPage } from '@/pages/auth/LoginPage'
import { RegisterPage } from '@/pages/auth/RegisterPage'
import { ResetPasswordPage } from '@/pages/auth/ResetPasswordPage'
import { VerifyEmailPage } from '@/pages/auth/VerifyEmailPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { AcceptInvitationPage } from '@/pages/onboarding/AcceptInvitationPage'
import { CreateBusinessPage } from '@/pages/onboarding/CreateBusinessPage'
import { SelectBusinessPage } from '@/pages/onboarding/SelectBusinessPage'
import { TermsPage } from '@/pages/TermsPage'
import { CataloguesPage } from '@/pages/content/CataloguesPage'
import { CategoriesPage } from '@/pages/content/CategoriesPage'
import { ProductsPage } from '@/pages/content/ProductsPage'
import { PublicCataloguePage } from '@/pages/public/PublicCataloguePage'
import { AdminLayout } from '@/layouts/AdminLayout'
import { BillingPage } from '@/pages/billing/BillingPage'
import { CheckoutPage } from '@/pages/billing/CheckoutPage'
import { InvoiceDetailPage, InvoicesPage } from '@/pages/billing/InvoicesPage'
import { PaymentStatusPage } from '@/pages/billing/PaymentStatusPage'
import { PlansPage } from '@/pages/billing/PlansPage'
import { FullPageSpinner } from '@/components/ui/Feedback'
import { GuestOnly, RequireAuth, RequireBusiness, RequirePlatformAccess } from '@/routes/guards'

/** Lazy routes need a fallback while their chunk loads on the very first page view. */
function withHydrateFallback(routes: RouteObject[]): RouteObject[] {
  return routes.map((route) => ({
    ...route,
    ...(route.lazy && !route.hydrateFallbackElement ? { hydrateFallbackElement: <FullPageSpinner /> } : {}),
    ...(route.children ? { children: withHydrateFallback(route.children) } : {}),
  }) as RouteObject)
}

export const router = createBrowserRouter(withHydrateFallback([
  // The marketing page (images, mockups) loads as its own chunk.
  { path: '/', lazy: async () => ({ Component: (await import('@/pages/HomePage')).HomePage }) },
  { path: '/terms', element: <TermsPage /> },
  // Public catalogue: anonymous, works on refresh (Vite/your web server must serve index.html for /c/*).
  { path: '/c/:businessSlug/:catalogueSlug', element: <PublicCataloguePage /> },
  {
    element: <AuthLayout />,
    children: [
      {
        element: <GuestOnly />,
        children: [
          { path: '/login', element: <LoginPage /> },
          { path: '/register', element: <RegisterPage /> },
          { path: '/forgot-password', element: <ForgotPasswordPage /> },
        ],
      },
      // Reachable whether or not the user is signed in (links arrive by email).
      { path: '/reset-password', element: <ResetPasswordPage /> },
      { path: '/verify-email', element: <VerifyEmailPage /> },
    ],
  },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <PlainLayout />,
        children: [
          { path: '/businesses', element: <SelectBusinessPage /> },
          { path: '/onboarding', element: <CreateBusinessPage /> },
          { path: '/invitations/accept', element: <AcceptInvitationPage /> },
        ],
      },
      {
        element: <RequireBusiness />,
        children: [
          {
            path: '/app',
            element: <AppLayout />,
            children: [
              { index: true, element: <DashboardPage /> },
              { path: 'business', element: <BusinessProfilePage /> },
              { path: 'team', element: <TeamPage /> },
              { path: 'roles', element: <RolesPage /> },
              { path: 'account', element: <AccountPage /> },
              { path: 'catalogues', element: <CataloguesPage /> },
              { path: 'catalogues/new', lazy: async () => ({ Component: (await import('@/pages/content/CatalogueEditorPage')).CatalogueEditorPage }) },
              { path: 'catalogues/:catalogueId', lazy: async () => ({ Component: (await import('@/pages/content/CatalogueEditorPage')).CatalogueEditorPage }) },
              { path: 'products', element: <ProductsPage /> },
              { path: 'products/new', lazy: async () => ({ Component: (await import('@/pages/content/ProductEditorPage')).ProductEditorPage }) },
              { path: 'products/:productId', lazy: async () => ({ Component: (await import('@/pages/content/ProductEditorPage')).ProductEditorPage }) },
              { path: 'categories', element: <CategoriesPage /> },
              { path: 'media', lazy: async () => ({ Component: (await import('@/pages/content/MediaLibraryPage')).MediaLibraryPage }) },
              // Lead pages (and their charts) load on demand to keep the initial bundle small.
              { path: 'enquiries', lazy: async () => ({ Component: (await import('@/pages/leads/EnquiriesPage')).EnquiriesPage }) },
              { path: 'customers', lazy: async () => ({ Component: (await import('@/pages/leads/CustomersPage')).CustomersPage }) },
              { path: 'qr-codes', lazy: async () => ({ Component: (await import('@/pages/leads/QrCodesPage')).QrCodesPage }) },
              { path: 'analytics', lazy: async () => ({ Component: (await import('@/pages/leads/AnalyticsPage')).AnalyticsPage }) },
              { path: 'notifications', lazy: async () => ({ Component: (await import('@/pages/app/NotificationsPage')).NotificationsPage }) },
              { path: 'activity', lazy: async () => ({ Component: (await import('@/pages/app/ActivityLogPage')).ActivityLogPage }) },
              { path: 'support', lazy: async () => ({ Component: (await import('@/pages/app/SupportPage')).SupportPage }) },
              { path: 'settings', lazy: async () => ({ Component: (await import('@/pages/app/SettingsPage')).SettingsPage }) },
              { path: 'billing', element: <BillingPage /> },
              { path: 'billing/plans', element: <PlansPage /> },
              { path: 'billing/checkout/:planId', element: <CheckoutPage /> },
              { path: 'billing/payments/:paymentId', element: <PaymentStatusPage /> },
              { path: 'billing/invoices', element: <InvoicesPage /> },
              { path: 'billing/invoices/:invoiceId', element: <InvoiceDetailPage /> },
            ],
          },
        ],
      },
      {
        element: <RequirePlatformAccess />,
        children: [
          {
            path: '/admin',
            element: <AdminLayout />,
            children: [
              // Platform admin screens are used by few people: load them on demand.
              { index: true, lazy: async () => ({ Component: (await import('@/pages/admin/AdminHome')).AdminBillingHome }) },
              { path: 'plans', lazy: async () => ({ Component: (await import('@/pages/admin/AdminPlansPage')).AdminPlansPage }) },
              { path: 'subscriptions', lazy: async () => ({ Component: (await import('@/pages/admin/AdminBillingPages')).AdminSubscriptionsPage }) },
              { path: 'payments', lazy: async () => ({ Component: (await import('@/pages/admin/AdminBillingPages')).AdminPaymentsPage }) },
              { path: 'support', lazy: async () => ({ Component: (await import('@/pages/admin/AdminSupportPage')).AdminSupportPage }) },
              { path: 'audit-logs', lazy: async () => ({ Component: (await import('@/pages/admin/AdminAuditLogPage')).AdminAuditLogPage }) },
              { path: 'dashboard', lazy: async () => ({ Component: (await import('@/pages/admin/AdminDashboardPage')).AdminDashboardPage }) },
              { path: 'businesses', lazy: async () => ({ Component: (await import('@/pages/admin/AdminBusinessesPage')).AdminBusinessesPage }) },
              { path: 'users', lazy: async () => ({ Component: (await import('@/pages/admin/AdminUsersPage')).AdminUsersPage }) },
              { path: 'catalogues', lazy: async () => ({ Component: (await import('@/pages/admin/AdminCataloguesPage')).AdminCataloguesPage }) },
              { path: 'domains-qr', lazy: async () => ({ Component: (await import('@/pages/admin/AdminDomainsQrPage')).AdminDomainsQrPage }) },
              { path: 'system', lazy: async () => ({ Component: (await import('@/pages/admin/AdminSystemPage')).AdminSystemPage }) },
              { path: 'profile', lazy: async () => ({ Component: (await import('@/pages/admin/AdminProfilePage')).AdminProfilePage }) },
              { path: 'announcements', lazy: async () => ({ Component: (await import('@/pages/admin/AdminAnnouncementsPage')).AdminAnnouncementsPage }) },
              { path: 'email-templates', lazy: async () => ({ Component: (await import('@/pages/admin/AdminEmailTemplatesPage')).AdminEmailTemplatesPage }) },
            ],
          },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
]))
