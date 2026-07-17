/**
 * Axios interceptor already returns response body:
 *   { code, message, data, ... }
 * Callers must NOT do `const body = await api(); body.data` inconsistently.
 * These helpers accept either the body or a nested `.data` for safety.
 */

export function apiPayload(response) {
  if (response == null) return null
  if (typeof response !== 'object') return response
  // Prefer explicit API envelope.
  if (Object.prototype.hasOwnProperty.call(response, 'data') && Object.prototype.hasOwnProperty.call(response, 'code')) {
    return response.data
  }
  // Already unwrapped business payload.
  return response
}

export function apiList(response, keys = ['items', 'data']) {
  const payload = apiPayload(response)
  if (Array.isArray(payload)) return payload
  if (payload && typeof payload === 'object') {
    for (const key of keys) {
      if (Array.isArray(payload[key])) return payload[key]
    }
  }
  // Fallback: body itself was a list-like envelope.
  if (response && typeof response === 'object') {
    for (const key of keys) {
      if (Array.isArray(response[key])) return response[key]
    }
  }
  return []
}

export function apiObject(response, fallback = {}) {
  const payload = apiPayload(response)
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) return payload
  return fallback
}
