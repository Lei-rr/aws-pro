import { defineStore } from 'pinia'
import { authApi, clearAuthCache } from '@/features/auth/api/auth'
import { apiObject } from '@/shared/api/http'

type SessionPayload = {
  authenticated?: boolean
  username?: string | null
}

export const useSessionStore = defineStore('session', {
  state: () => ({
    authenticated: false,
    username: '' as string,
    loading: false,
    checked: false,
  }),
  actions: {
    async load(options: { refresh?: boolean } = {}) {
      if (!options.refresh && this.checked) return this
      this.loading = true
      try {
        const me = apiObject(await authApi.me()) as SessionPayload
        // Backend GET /session returns 200 even when anonymous.
        // Must trust payload.authenticated — never assume success ⇒ signed in.
        this.authenticated = me.authenticated === true
        this.username = this.authenticated ? String(me.username || '') : ''
        this.checked = true
        if (!this.authenticated) {
          clearAuthCache()
          throw new Error('unauthorized')
        }
        return this
      } catch (error) {
        this.authenticated = false
        this.username = ''
        this.checked = true
        throw error instanceof Error ? error : new Error('unauthorized')
      } finally {
        this.loading = false
      }
    },
    async login(username: string, password: string) {
      clearAuthCache()
      const me = apiObject(await authApi.login(username, password)) as SessionPayload
      // Same rule as load(): only explicit authenticated===true counts as signed-in.
      this.authenticated = me.authenticated === true
      this.username = this.authenticated ? String(me.username || username) : ''
      this.checked = true
      if (!this.authenticated) {
        clearAuthCache()
        throw new Error('unauthorized')
      }
    },
    async logout() {
      try {
        await authApi.logout()
      } catch {
        /* ignore */
      }
      this.invalidate()
    },
    invalidate() {
      clearAuthCache()
      this.authenticated = false
      this.username = ''
      this.checked = true
      this.loading = false
    },
  },
})
