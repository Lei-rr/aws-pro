import http from '@/shared/api/http'
import { encodePath } from '@/shared/lib/path'
import type { Account } from '@/shared/types'

export const accountApi = {
  list() {
    return http.get('/accounts')
  },
  save(account: Partial<Account> & { original_id?: string }) {
    const { original_id: originalId, ...payload } = account
    if (originalId) {
      return http.put(`/accounts/${encodePath(String(originalId))}`, payload)
    }
    return http.post('/accounts', payload)
  },
  remove(id: string) {
    return http.delete(`/accounts/${encodePath(id)}`)
  },
}
