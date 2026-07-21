import http from '@/shared/api/http'

export const billingApi = {
  yearly(data: Record<string, unknown>, options: { refresh?: boolean; cache_only?: boolean } = {}) {
    const payload = { ...data }
    if (options.refresh) payload.refresh = true
    if (options.cache_only) payload.cache_only = true
    return http.post('/billing/yearly', payload)
  },
}
