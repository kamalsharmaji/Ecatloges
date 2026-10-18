import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router-dom'
import { queryClient } from '@/app/queryClient'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { BusinessProvider } from '@/features/business/BusinessProvider'
import { router } from '@/routes/router'

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BusinessProvider>
          <RouterProvider router={router} />
        </BusinessProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}
