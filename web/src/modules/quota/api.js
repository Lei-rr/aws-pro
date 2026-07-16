import http from '../../shared/utils/request.js'

export const quotaApi = {
  vcpu(data, options = {}) {
    const payload = { ...data }
    if (options.refresh) payload.refresh = true
    if (options.cache_only) payload.cache_only = true
    return http.post('/quotas/vcpu', payload)
  },
}
