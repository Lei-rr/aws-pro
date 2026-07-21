import http from '@/shared/api/http'

export const configApi = {
  all() {
    return http.get('/config')
  },
}
