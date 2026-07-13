
import http from '@/shared/utils/request'
import type { AwsAccount } from '@/types'

export const accountApi = {
  list: () => http.get<AwsAccount[]>('/accounts'),
  create: (data: Record<string, unknown>) => http.post<AwsAccount>('/accounts', data),
  update: (id: string, data: Record<string, unknown>) => http.put<AwsAccount>(`/accounts/${encodeURIComponent(id)}`, data),
  remove: (id: string) => http.delete(`/accounts/${encodeURIComponent(id)}`),
}
