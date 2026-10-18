import { createBrowserRouter } from 'react-router-dom'
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
import { HomePage } from '@/pages/HomePage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { AcceptInvitationPage } from '@/pages/onboarding/AcceptInvitationPage'
import { CreateBusinessPage } from '@/pages/onboarding/CreateBusinessPage'
import { SelectBusinessPage } from '@/pages/onboarding/SelectBusinessPage'
import { TermsPage } from '@/pages/TermsPage'
import { GuestOnly, RequireAuth, RequireBusiness } from '@/routes/guards'

export const router = createBrowserRouter([
  { path: '/', element: <HomePage /> },
  { path: '/terms', element: <TermsPage /> },
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
            ],
          },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
])
