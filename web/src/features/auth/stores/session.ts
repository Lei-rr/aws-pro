import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { authApi, type SessionState } from '@/features/auth/api/auth'
import { apiObject } from '@/shared/api/http'
import { clearAccountsCache } from '@/features/accounts/stores/accounts'

const anonymousSession: SessionState = {
  authenticated: false,
  username: null,
}

export const useSessionStore = defineStore('session', () => {
  const session = ref<SessionState | null>(null)
  const checked = ref(false)
  const loading = ref(false)
  const authenticated = computed(() => session.value?.authenticated === true)
  const username = computed(() => session.value?.username ?? null)

  let pendingSession: Promise<SessionState> | null = null
  let requestToken = 0

  async function load(options: { refresh?: boolean } = {}) {
    if (options.refresh) {
      pendingSession = null
      requestToken += 1
    }
    if (!options.refresh && checked.value && session.value) return session.value

    if (!pendingSession) {
      const token = ++requestToken
      loading.value = true
      const promise = authApi
        .me()
        .then((response) => {
          const next = apiObject<SessionState>(response, anonymousSession)
          if (token !== requestToken) return session.value ?? anonymousSession
          session.value = {
            authenticated: next.authenticated === true,
            username: next.authenticated === true ? next.username : null,
          }
          checked.value = true
          if (!session.value.authenticated) clearAccountsCache()
          return session.value
        })
        .catch((error) => {
          if (token !== requestToken) return session.value ?? anonymousSession
          invalidate()
          throw error
        })
        .finally(() => {
          if (token !== requestToken) return
          if (pendingSession === promise) pendingSession = null
          loading.value = false
        })
      pendingSession = promise
    }

    return pendingSession
  }

  async function login(loginUsername: string, password: string) {
    pendingSession = null
    const token = ++requestToken
    loading.value = true
    try {
      const response = await authApi.login(loginUsername, password)
      const next = apiObject<SessionState>(response, anonymousSession)
      if (token !== requestToken) return session.value ?? anonymousSession
      session.value = {
        authenticated: next.authenticated === true,
        username: next.authenticated === true ? String(next.username || loginUsername) : null,
      }
      checked.value = true
      clearAccountsCache()
      if (!session.value.authenticated) throw new Error('unauthorized')
      return session.value
    } finally {
      if (token === requestToken) loading.value = false
    }
  }

  async function logout() {
    invalidate()
    await authApi.logout().catch(() => {})
  }

  function invalidate() {
    pendingSession = null
    requestToken += 1
    session.value = anonymousSession
    checked.value = true
    loading.value = false
    clearAccountsCache()
  }

  return { session, checked, loading, authenticated, username, load, login, logout, invalidate }
})
