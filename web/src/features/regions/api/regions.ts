import http from '@/shared/api/http'

export const regionsApi = {
  list(accountId: string, options: { refresh?: boolean; cacheOnly?: boolean } = {}) {
    const params: Record<string, unknown> = { account_id: accountId }
    if (options.refresh) params.refresh = 'true'
    if (options.cacheOnly) params.cache_only = 'true'
    return http.get('/regions', { params })
  },
  enable(data: Record<string, unknown>) {
    return http.post('/regions/enable', data)
  },
}
