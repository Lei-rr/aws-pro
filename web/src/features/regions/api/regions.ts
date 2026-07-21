import http from '@/shared/api/http'

export const regionsApi = {
  list(accountId: string, options: { refresh?: boolean; cache_only?: boolean } = {}) {
    const params: Record<string, unknown> = { account_id: accountId }
    if (options.refresh) params.refresh = 1
    if (options.cache_only) params.cache_only = 1
    return http.get('/regions', { params })
  },
  enable(data: Record<string, unknown>) {
    return http.post('/regions/enable', data)
  },
}
