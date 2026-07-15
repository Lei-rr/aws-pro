import http from '../../../shared/utils/request.js'

const endpoints = {
  login: '/session',
  logout: '/session',
  me: '/session',
}

let mePromise = null

function rememberMe(response) {
  mePromise = Promise.resolve(response)
  return response
}

export function clearAuthCache() {
  mePromise = null
}

window.addEventListener('auth-invalidated', clearAuthCache)

export const authApi = {
  login: async (username, password) => {
    const response = await http.post(endpoints.login, { username, password })
    return rememberMe(response)
  },
  logout: async () => {
    clearAuthCache()
    return http.delete(endpoints.logout)
  },
  me: () => {
    if (!mePromise) {
      mePromise = http.get(endpoints.me).catch((error) => {
        clearAuthCache()
        throw error
      })
    }
    return mePromise
  },
}
