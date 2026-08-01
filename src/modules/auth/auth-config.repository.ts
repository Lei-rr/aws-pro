import { JsonStore } from '../../platform/storage/json-store.js'

export interface AppConfigData {
  auth: {
    username: string
    password: string
  }
}

export const DEFAULT_APP_CONFIG: AppConfigData = {
  auth: { username: 'admin', password: 'admin' },
}

export class AppConfigRepository {
  constructor(private readonly store: JsonStore<AppConfigData>) {}

  async initialize(): Promise<void> {
    await this.store.read()
  }

  async read(): Promise<AppConfigData> {
    return this.store.read()
  }
}
