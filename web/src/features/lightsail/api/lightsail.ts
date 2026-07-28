import http from '@/shared/api/http'
import { encodePath } from '@/shared/lib/path'

export const lightsailApi = {
  instances(params: Record<string, unknown> = {}) {
    return http.get('/lightsail/instances', { params })
  },
  sync(data: Record<string, unknown>) {
    return http.post('/lightsail/instances/sync', data)
  },
  createOptions(params: Record<string, unknown>) {
    return http.get('/lightsail/create-options', { params })
  },
  create(data: Record<string, unknown>) {
    return http.post('/lightsail/instances', data)
  },
  updateRemark(data: Record<string, unknown>) {
    return http.put(`/lightsail/instances/${encodePath(String(data.instance_name))}/remark`, data)
  },
  action(data: Record<string, unknown>) {
    return http.post(`/lightsail/instances/${encodePath(String(data.instance_name))}/actions`, data)
  },
}
