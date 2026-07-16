import http from '../../shared/utils/request.js'

export const billingApi = {
  yearly(data, options = {}) {
    const payload = { ...data }
    if (options.refresh) payload.refresh = true
    if (options.cache_only) payload.cache_only = true
    return http.post('/billing/yearly', payload)
  },
}
