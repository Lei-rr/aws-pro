import type { AppConfigRepository } from './auth-config.repository.js'

export class AuthConfig {
  constructor(private readonly repository: AppConfigRepository) {}

  async getCredentials(): Promise<{ username: string; password: string }> {
    const data = await this.repository.read()
    const username = String(data.auth?.username || '').trim() || 'admin'
    const password = String(data.auth?.password || '').trim() || 'admin'
    return { username, password }
  }

  async verifyCredentials(username: string, password: string): Promise<boolean> {
    const creds = await this.getCredentials()
    return username === creds.username && password === creds.password
  }
}
