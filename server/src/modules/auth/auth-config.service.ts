import crypto from 'node:crypto'
import type { AppConfigRepository } from './auth-config.repository.js'

function timingSafeEqualStr(a: string, b: string): boolean {
  const hashA = crypto.createHash('sha256').update(a).digest()
  const hashB = crypto.createHash('sha256').update(b).digest()
  return crypto.timingSafeEqual(hashA, hashB)
}

export class AuthConfig {
  constructor(private readonly repository: AppConfigRepository) {}

  async getCredentials(): Promise<{ username: string; password: string }> {
    const data = await this.repository.read()
    return {
      username: (data.auth?.username ?? '').trim(),
      password: (data.auth?.password ?? '').trim(),
    }
  }

  async verifyCredentials(username: string, password: string): Promise<boolean> {
    const creds = await this.getCredentials()
    if (!creds.username || !creds.password) return false
    return timingSafeEqualStr(username, creds.username) && timingSafeEqualStr(password, creds.password)
  }

  async isDefaultCredential(): Promise<boolean> {
    const creds = await this.getCredentials()
    return creds.username === 'admin' && creds.password === 'admin'
  }
}
