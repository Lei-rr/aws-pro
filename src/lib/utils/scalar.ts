export function scalarString(value: unknown, fallback = ''): string {
  if (value === undefined || value === null) return fallback
  if (typeof value === 'number') return Number.isFinite(value) ? String(value).trim() : fallback
  return typeof value === 'string' || typeof value === 'boolean'
    ? String(value).trim()
    : fallback
}

export function providerString(value: unknown, fallback = ''): string {
  return scalarString(value, fallback)
}

export function providerFiniteNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim()
      ? Number(value)
      : Number.NaN
  return Number.isFinite(parsed) ? parsed : fallback
}
