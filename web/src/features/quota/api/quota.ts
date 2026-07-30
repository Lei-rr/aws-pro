import http from '@/shared/api/http'

export const quotaApi = {
  vcpu(data: Record<string, unknown>, options: { refresh?: boolean; cacheOnly?: boolean } = {}) {
    const payload = { ...data }
    if (options.refresh) payload.refresh = true
    if (options.cacheOnly) payload.cache_only = true
    return http.post('/quotas/vcpu', payload)
  },
}
