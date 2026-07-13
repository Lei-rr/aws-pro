
import http from '@/shared/utils/request'

export const lightsailApi = {
  list: (params: Record<string, unknown> = {}) => http.get('/lightsail/instances', { params }),
  sync: (account_id: string, region: string) => http.post('/lightsail/instances/sync', { account_id, region }),
  options: (account_id: string, region: string) => http.get('/lightsail/create-options', { params: { account_id, region } }),
  create: (data: Record<string, unknown>) => http.post('/lightsail/instances', data),
  remark: (instance: string, data: Record<string, unknown>) => http.put(`/lightsail/instances/${encodeURIComponent(instance)}/remark`, data),
  action: (instance: string, data: Record<string, unknown>) => http.post(`/lightsail/instances/${encodeURIComponent(instance)}/actions`, data),
}
