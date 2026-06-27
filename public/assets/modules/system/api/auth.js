import http from '../../../api/http.js'

const endpoints = {
  login: '/session',
  logout: '/session',
  me: '/session',
  user: '/user',
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
  captchaUrl: () => `/captcha?t=${Date.now()}`,
  login: async (username, password, captcha) => {
    const response = await http.post(endpoints.login, { username, password, captcha })
    return rememberMe(response)
  },
  updateUser: async (data) => {
    const response = await http.put(endpoints.user, data)
    return rememberMe(response)
  },
  logout: async () => {
    clearAuthCache()
    return http.delete(endpoints.logout)
  },
  me: () => {
    if (!mePromise) mePromise = http.get(endpoints.me).catch((error) => {
      clearAuthCache()
      throw error
    })
    return mePromise
  },
}
