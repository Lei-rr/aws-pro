import { accountApi } from '../api/accounts.js';

import { defineStore } from 'pinia'

let accountsPromise = null;

export const useAccountStore = defineStore('accounts', {
    state: () => ({ accounts: null, loading: false, error: null }),
    actions: {
        async load(options = {}) {
            if (options.refresh) {
                accountsPromise = null;
                this.accounts = null;
            }
            if (this.accounts) return this.accounts;

            if (!accountsPromise) {
                this.loading = true;
                this.error = null;
                accountsPromise = accountApi.list()
                    .then((response) => {
                        this.accounts = response.data;
                        return this.accounts;
                    })
                    .catch((error) => {
                        this.error = error;
                        throw error;
                    })
                    .finally(() => {
                        accountsPromise = null;
                        this.loading = false;
                    });
            }

            return accountsPromise;
        },
        clear() {
            accountsPromise = null;
            this.accounts = null;
            this.error = null;
        }
    }
});

export async function loadAccounts(options = {}) {
    return useAccountStore().load(options);
}

export function clearAccountsCache() {
    useAccountStore().clear();
}

window.addEventListener('accounts-updated', clearAccountsCache);
