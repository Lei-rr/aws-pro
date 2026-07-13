import { ApiError } from '../http/api-error.js'

export function required(data: Record<string, unknown>, fields: string[]): void {
  for (const field of fields) {
    const value = data[field]
    if (value === undefined || value === null || String(value).trim() === '') {
      throw new ApiError('field_required', `${field} is required`, 422, { field })
    }
  }
}

export function accountId(value: string): string {
  const id = value.trim()
  if (!/^\d{12}$/.test(id) && !/^[A-Za-z0-9._:-]{2,64}$/.test(id)) {
    // allow custom account labels used by personal panels, still non-empty
    if (id === '') throw new ApiError('account_id_invalid', 'Invalid account id', 422)
  }
  return id
}

export function region(value: string): string {
  const region = value.trim()
  if (!/^[a-z0-9-]+$/.test(region)) {
    throw new ApiError('region_invalid', 'Invalid region', 422, { region })
  }
  return region
}

export function instanceName(value: string): string {
  const name = value.trim()
  if (name === '' || name.length > 128) {
    throw new ApiError('instance_name_invalid', 'Invalid instance name', 422)
  }
  return name
}
