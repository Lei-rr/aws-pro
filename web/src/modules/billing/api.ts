
import http from '@/shared/utils/request'
export const billingApi = {
  yearly: (account_id: string, refresh=false) => http.post('/billing/yearly', { account_id }, { params: { refresh: refresh ? 1 : undefined } }),
}
