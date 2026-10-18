import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'

export interface HealthStatus {
  status: 'ok' | 'degraded'
  database: 'ok' | 'unavailable'
}

export function useHealthCheck() {
  return useQuery({
    queryKey: ['system', 'health'],
    queryFn: async () => (await api.get<HealthStatus>('/health/')).data,
  })
}
