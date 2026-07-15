import { AppConfigRepository } from './app-config-repository.js'

const DEFAULT_USERNAME = 'admin'
const DEFAULT_PASSWORD = 'admin'

export class AuthConfig {
  constructor(private readonly repository: AppConfigRepository = new AppConfigRepository()) {}

  async verifyCredentials(username: string, password: string): Promise<boolean> {
    const config = await this.repository.read()
    // Missing/empty data/config.json falls back to the same defaults as dns-pro.
    const expectedUser = String(config.auth?.username ?? '').trim() || DEFAULT_USERNAME
    const expectedPass = String(config.auth?.password ?? '').trim() || DEFAULT_PASSWORD
    return expectedUser === username && expectedPass === password
  }
}
