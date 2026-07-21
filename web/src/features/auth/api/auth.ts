import http from '@/shared/api/http'

let mePromise: Promise<unknown> | null = null

function rememberMe(response: unknown) {
  mePromise = Promise.resolve(response)
  return response
}

export function clearAuthCache() {
  mePromise = null
}

if (typeof window !== 'undefined') {
  window.addEventListener('auth-invalidated', clearAuthCache)
}

export const authApi = {
  login: async (username: string, password: string) => {
    clearAuthCache()
    // Login 401 must not be treated as "session expired" side-effect loops.
    // http still fires unauthorizedHandler on any 401; main.ts no-ops on /login.
    const response = await http.post('/session', { username, password })
    return rememberMe(response)
  },
  logout: async () => {
    clearAuthCache()
    return http.delete('/session')
  },
  me: () => {
    if (!mePromise) {
      mePromise = http.get('/session').catch((error) => {
        clearAuthCache()
        throw error
      })
    }
    return mePromise
  },
}
