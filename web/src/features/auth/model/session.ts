import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { authApi, type SessionState } from '@/features/auth/api/auth'
import { apiObject } from '@/shared/api/http'

function notifySessionChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('session-changed'))
}

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
  const isDefaultCredential = computed(() => session.value?.is_default_credential === true)
  const version = computed(() => session.value?.version || '1.0.0')

  let pendingSession: Promise<SessionState> | null = null
  let requestToken = 0

  async function load(options: { refresh?: boolean } = {}) {
    if (options.refresh && pendingSession) {
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
            version: next.version || '1.0.0',
            is_default_credential: next.is_default_credential === true,
          }
          checked.value = true
          if (!session.value.authenticated) notifySessionChanged()
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
        version: next.version || '1.0.0',
        is_default_credential: next.is_default_credential === true,
      }
      checked.value = true
      notifySessionChanged()
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
    notifySessionChanged()
  }

  return {
    session,
    checked,
    loading,
    authenticated,
    username,
    isDefaultCredential,
    version,
    load,
    login,
    logout,
    invalidate,
  }
})
