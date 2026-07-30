import path from 'node:path'

export interface AppConfig {
  host: string
  port: number
  logLevel: string | false
  dataDir: string
  cacheMaxEntries: number
  cacheSweepIntervalMs: number
  sessionSecret: string
  sessionCookieName: string
  sessionMaxAgeSeconds: number
  cookieSecure: boolean
  cookieSameSite: 'lax' | 'strict' | 'none'
  trustProxy: boolean
  httpTimeoutMs: number
}

const DEFAULT_CONFIG: AppConfig = {
  host: '0.0.0.0',
  port: 2023,
  logLevel: false,
  dataDir: path.resolve('data'),
  cacheMaxEntries: 0,
  cacheSweepIntervalMs: 10 * 60 * 1000,
  sessionSecret: '',
  sessionCookieName: 'aws_pro_session',
  sessionMaxAgeSeconds: 7 * 24 * 60 * 60,
  cookieSecure: false,
  cookieSameSite: 'lax',
  trustProxy: false,
  httpTimeoutMs: 30000,
}

function envFlag(value: string | undefined, fallback: boolean): boolean {
  if (value == null || value.trim() === '') return fallback
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
}

export function loadAppConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  const env = process.env
  return {
    ...DEFAULT_CONFIG,
    sessionSecret: String(env.SESSION_SECRET ?? '').trim(),
    cookieSecure: envFlag(env.COOKIE_SECURE, DEFAULT_CONFIG.cookieSecure),
    ...overrides,
  }
}
