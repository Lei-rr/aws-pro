import http from '@/shared/api/http'
import { encodePath } from '@/shared/lib/path'
import type { Account } from '@/shared/types'

export const accountApi = {
  list() {
    return http.get('/accounts')
  },
  save(account: Partial<Account> & { original_id?: string }) {
    if (account.original_id) {
      return http.put(`/accounts/${encodePath(String(account.original_id))}`, account)
    }
    return http.post('/accounts', account)
  },
  remove(id: string) {
    return http.delete(`/accounts/${encodePath(id)}`)
  },
}
