import { JsonStore } from '../../platform/storage/json-store.js'
import { ApiError } from '../../shared/http/api-error.js'

export interface AppConfigData {
  auth: {
    username: string
    password: string
  }
}

export const DEFAULT_APP_CONFIG: AppConfigData = {
  auth: { username: 'admin', password: 'admin' },
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

function hasValidAuth(data: AppConfigData): boolean {
  const auth = data.auth
  return typeof auth === 'object' && auth !== null && isNonEmptyString(auth.username) && isNonEmptyString(auth.password)
}

export class AppConfigRepository {
  constructor(private readonly store: JsonStore<AppConfigData>) {}

  async initialize(): Promise<void> {
    await this.store.read()
  }

  async read(): Promise<AppConfigData> {
    const data = await this.store.read()
    if (!hasValidAuth(data)) {
      throw new ApiError('invalid_auth_config', 'Auth config is corrupted', 500, {
        hint: `${this.store.getPath()} 缺少 auth.username/password（或为空），请修复后重启服务`,
      })
    }
    return data
  }
}
