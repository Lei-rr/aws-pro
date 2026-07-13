
import http from '@/shared/utils/request'
export const quotaApi = {
  vcpu: (account_id: string, region: string, refresh=false) => http.post('/quotas/vcpu', { account_id, region }, { params: { refresh: refresh ? 1 : undefined } }),
}
