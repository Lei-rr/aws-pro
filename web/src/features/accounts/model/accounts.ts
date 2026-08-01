import { defineStore } from 'pinia'
import { accountApi } from '@/features/accounts/api/accounts'
import { apiList } from '@/shared/api/http'
import type { Account } from '@/shared/api/types'

let accountsPromise: Promise<Account[]> | null = null
let accountsRequestToken = 0

export const useAccountStore = defineStore('accounts', {
  state: () => ({
    accounts: null as Account[] | null,
    loading: false,
    error: null as unknown,
  }),
  actions: {
    async load(options: { force?: boolean } = {}) {
      if (options.force) {
        accountsPromise = null
        accountsRequestToken += 1
      }
      if (!options.force && this.accounts) return this.accounts
      if (!accountsPromise) {
        const token = ++accountsRequestToken
        this.loading = true
        this.error = null
        const promise = accountApi
          .list()
          .then((response) => {
            if (token !== accountsRequestToken) return this.accounts || []
            this.accounts = apiList<Account>(response)
            return this.accounts
          })
          .catch((error) => {
            if (token !== accountsRequestToken) return this.accounts || []
            this.error = error
            throw error
          })
          .finally(() => {
            if (token !== accountsRequestToken) return
            if (accountsPromise === promise) accountsPromise = null
            this.loading = false
          })
        accountsPromise = promise
      }
      return accountsPromise
    },
    clear() {
      accountsPromise = null
      accountsRequestToken += 1
      this.accounts = null
      this.error = null
      this.loading = false
    },
    setLocal(list: Account[]) {
      accountsPromise = null
      accountsRequestToken += 1
      this.accounts = list
      this.error = null
      this.loading = false
    },
  },
})

export async function loadAccounts(options: { force?: boolean } = {}) {
  return useAccountStore().load(options)
}

export function clearAccountsCache() {
  useAccountStore().clear()
}

if (typeof window !== 'undefined') {
  window.addEventListener('accounts-updated', clearAccountsCache)
  window.addEventListener('session-changed', clearAccountsCache)
}
