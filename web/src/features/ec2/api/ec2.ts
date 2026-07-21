import http from '@/shared/api/http'

export const ec2Api = {
  instances(params: Record<string, unknown> = {}) {
    return http.get('/ec2/instances', { params })
  },
  sync(data: Record<string, unknown>) {
    return http.post('/ec2/instances/sync', data)
  },
  createOptions() {
    return http.get('/ec2/create-options')
  },
  create(data: Record<string, unknown>) {
    return http.post('/ec2/instances', data)
  },
  updateRemark(data: Record<string, unknown>) {
    return http.put(`/ec2/instances/${encodeURIComponent(String(data.instance_id))}/remark`, data)
  },
  action(data: Record<string, unknown>) {
    return http.post(`/ec2/instances/${encodeURIComponent(String(data.instance_id))}/actions`, data)
  },
}
