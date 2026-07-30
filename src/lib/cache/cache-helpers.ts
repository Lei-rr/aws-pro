export function buildCacheKey(prefix: string, parts: Record<string, unknown>): string {
  const entries = Object.entries(parts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => {
      return `${sanitize(String(key))}=${sanitize(stringifyValue(value))}`
    })
  return [prefix, ...entries].join(':')
}

function stringifyValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '-'
  if (typeof value === 'boolean') return value ? '1' : '0'
  if (typeof value === 'number') return String(value)
  if (typeof value === 'object') {
    const keys = Object.keys(value).sort()
    return JSON.stringify(value, keys)
  }
  return String(value)
}

function sanitize(segment: string): string {
  return segment.replace(/[:\s]/g, '_')
}
