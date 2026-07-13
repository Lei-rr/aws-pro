
import http from '@/shared/utils/request'
export const regionApi = {
  list: (account_id: string, refresh = false) => http.get('/regions', { params: { account_id, refresh: refresh ? 1 : undefined } }),
  enable: (account_id: string, region: string) => http.post('/regions/enable', { account_id, region }),
}
