import axios from 'axios'

const http = axios.create({
  baseURL: '/api',
  timeout: 120000,
  withCredentials: true,
})

http.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const payload = error.response?.data || {}
    const message = payload.message || error.message || '请求失败'
    const requestError = new Error(message)
    requestError.code = payload.code || 'REQUEST_FAILED'
    requestError.details = payload.details || {}
    requestError.status = error.response?.status || 0
    if (error.response?.status === 401 && location.hash !== '#/login') {
      window.dispatchEvent(new CustomEvent('auth-invalidated'))
      location.hash = '#/login'
    }
    return Promise.reject(requestError)
  }
)

export default http
