import { defineStore } from 'pinia'
import { accountApi } from '@/features/accounts/api/accounts'
import { apiList } from '@/shared/api/http'
import type { Account } from '@/shared/types'

let accountsPromise: Promise<Account[]> | null = null

export const useAccountStore = defineStore('accounts', {
  state: () => ({
    accounts: null as Account[] | null,
    loading: false,
    error: null as unknown,
  }),
  actions: {
    async load(options: { refresh?: boolean } = {}) {
      if (options.refresh) {
        accountsPromise = null
        this.accounts = null
      }
      if (this.accounts) return this.accounts
      if (!accountsPromise) {
        this.loading = true
        this.error = null
        accountsPromise = accountApi
          .list()
          .then((response) => {
            this.accounts = apiList<Account>(response)
            return this.accounts
          })
          .catch((error) => {
            this.error = error
            throw error
          })
          .finally(() => {
            accountsPromise = null
            this.loading = false
          })
      }
      return accountsPromise
    },
    clear() {
      accountsPromise = null
      this.accounts = null
      this.error = null
    },
    setLocal(list: Account[]) {
      this.accounts = list
    },
  },
})

export async function loadAccounts(options: { refresh?: boolean } = {}) {
  return useAccountStore().load(options)
}

export function clearAccountsCache() {
  useAccountStore().clear()
}

if (typeof window !== 'undefined') {
  window.addEventListener('accounts-updated', clearAccountsCache)
}
