/**
 * Native fetch client (axios-compatible surface for this project).
 * - credentials: include
 * - returns JSON body directly (not Response)
 * - 401 → auth-invalidated event + optional redirect
 */

const DEFAULT_TIMEOUT_MS = 120000

export class RequestError extends Error {
  constructor(message, { code = 'REQUEST_FAILED', details = {}, status = 0 } = {}) {
    super(message)
    this.name = 'RequestError'
    this.code = code
    this.details = details
    this.status = status
  }
}

function buildUrl(baseURL, url, params) {
  const path = url.startsWith('http') ? url : `${baseURL.replace(/\/$/, '')}/${url.replace(/^\//, '')}`
  const target = new URL(path, typeof window !== 'undefined' ? window.location.origin : 'http://localhost')
  if (params && typeof params === 'object') {
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null || value === '') continue
      if (Array.isArray(value)) {
        for (const item of value) target.searchParams.append(key, String(item))
      } else {
        target.searchParams.set(key, String(value))
      }
    }
  }
  return `${target.pathname}${target.search}`
}

async function parseBody(response) {
  if (response.status === 204) return null
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

function createHttp(options = {}) {
  const baseURL = options.baseURL || '/api'
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const onUnauthorized = options.onUnauthorized

  async function request(method, url, { params, data, headers, signal, timeout } = {}) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeout ?? timeoutMs)
    if (signal) {
      if (signal.aborted) controller.abort()
      else signal.addEventListener('abort', () => controller.abort(), { once: true })
    }

    const finalHeaders = { Accept: 'application/json', ...(headers || {}) }
    let body
    if (data !== undefined && data !== null && method !== 'GET' && method !== 'HEAD') {
      if (typeof FormData !== 'undefined' && data instanceof FormData) {
        body = data
      } else if (typeof data === 'string' || data instanceof Blob) {
        body = data
      } else {
        finalHeaders['Content-Type'] = finalHeaders['Content-Type'] || 'application/json'
        body = JSON.stringify(data)
      }
    }

    try {
      const response = await fetch(buildUrl(baseURL, url, params), {
        method,
        headers: finalHeaders,
        body,
        credentials: 'include',
        signal: controller.signal,
      })
      const payload = await parseBody(response)

      if (!response.ok) {
        const message =
          (payload && typeof payload === 'object' && payload.message) ||
          response.statusText ||
          '请求失败'
        const err = new RequestError(String(message), {
          code: (payload && typeof payload === 'object' && payload.code) || 'REQUEST_FAILED',
          details: (payload && typeof payload === 'object' && payload.details) || {},
          status: response.status,
        })
        if (response.status === 401) {
          if (typeof onUnauthorized === 'function') onUnauthorized(err)
          else if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('auth-invalidated'))
            if (window.location.hash !== '#/login') window.location.hash = '#/login'
          }
        }
        throw err
      }

      return payload
    } catch (error) {
      if (error instanceof RequestError) throw error
      if (error?.name === 'AbortError') {
        throw new RequestError('请求超时或已取消', { code: 'TIMEOUT', status: 0 })
      }
      throw new RequestError(error?.message || '网络错误', { code: 'NETWORK_ERROR', status: 0 })
    } finally {
      clearTimeout(timer)
    }
  }

  return {
    get: (url, config = {}) => request('GET', url, config),
    delete: (url, config = {}) => request('DELETE', url, config),
    post: (url, data, config = {}) => request('POST', url, { ...config, data }),
    put: (url, data, config = {}) => request('PUT', url, { ...config, data }),
    patch: (url, data, config = {}) => request('PATCH', url, { ...config, data }),
    request,
  }
}

const http = createHttp({ baseURL: '/api' })

export { createHttp }
export default http
