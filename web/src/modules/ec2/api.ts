
import http from '@/shared/utils/request'
export const ec2Api = {
  list: (params: Record<string, unknown> = {}) => http.get('/ec2/instances', { params }),
  sync: (account_id: string, region: string) => http.post('/ec2/instances/sync', { account_id, region }),
  options: () => http.get('/ec2/create-options'),
  create: (data: Record<string, unknown>) => http.post('/ec2/instances', data),
  remark: (instance: string, data: Record<string, unknown>) => http.put(`/ec2/instances/${encodeURIComponent(instance)}/remark`, data),
  action: (instance: string, data: Record<string, unknown>) => http.post(`/ec2/instances/${encodeURIComponent(instance)}/actions`, data),
}
