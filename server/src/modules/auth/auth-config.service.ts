import type { AppConfigRepository } from './auth-config.repository.js'

export class AuthConfig {
  constructor(private readonly repository: AppConfigRepository) {}

  async getCredentials(): Promise<{ username: string; password: string }> {
    const data = await this.repository.read()
    return {
      username: data.auth.username.trim(),
      password: data.auth.password.trim(),
    }
  }

  async verifyCredentials(username: string, password: string): Promise<boolean> {
    const creds = await this.getCredentials()
    return username === creds.username && password === creds.password
  }
}
