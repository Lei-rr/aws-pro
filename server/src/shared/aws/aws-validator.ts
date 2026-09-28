import { ApiError } from '../http/api-error.js'

export function required(data: Record<string, unknown>, fields: string[]): void {
  for (const field of fields) {
    const value = data[field]
    if (
      value === undefined ||
      value === null ||
      (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') ||
      String(value).trim() === ''
    ) {
      throw new ApiError('field_required', `${field} is required`, 422, { field })
    }
  }
}

function hasControlChars(value: string): boolean {
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0
    if (code <= 0x1f || code === 0x7f) return true
  }
  return false
}

export function accountId(value: string): string {
  const id = value.trim()
  // Labels are free-form (mail addresses are common), so only reject what breaks storage, logs, and cache keys.
  if (id === '' || id.length > 64 || hasControlChars(id)) {
    throw new ApiError('account_id_invalid', 'Invalid account id', 422)
  }
  return id
}

/** Blank input means "no filter", not "invalid filter". */
export function optionalAccountId(value?: string): string | null {
  return value?.trim() ? accountId(value) : null
}

export function region(value: string): string {
  const region = value.trim()
  if (!/^[a-z0-9-]+$/.test(region)) {
    throw new ApiError('region_invalid', 'Invalid region', 422, { region })
  }
  return region
}

/** Blank input means "no filter", not "invalid filter". */
export function optionalRegion(value?: string): string | null {
  return value?.trim() ? region(value) : null
}

export function instanceName(value: string): string {
  const name = value.trim()
  if (name === '' || name.length > 128) {
    throw new ApiError('instance_name_invalid', 'Invalid instance name', 422)
  }
  return name
}
