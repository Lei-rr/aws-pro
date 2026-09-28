import path from 'node:path'

export interface AppConfig {
  host: string
  port: number
  logLevel: string | false
  dataDir: string
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

function envString(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim()
  return trimmed ? trimmed : fallback
}

function envNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return value != null && value.trim() !== '' && Number.isFinite(parsed) ? parsed : fallback
}

function envSameSite(value: string | undefined, fallback: AppConfig['cookieSameSite']): AppConfig['cookieSameSite'] {
  const candidate = value?.trim().toLowerCase()
  return candidate === 'lax' || candidate === 'strict' || candidate === 'none' ? candidate : fallback
}

/** 环境变量提供默认值，CLI overrides 最终覆盖。 */
export function loadAppConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  const env = process.env
  return {
    ...DEFAULT_CONFIG,
    host: envString(env.HOST, DEFAULT_CONFIG.host),
    port: envNumber(env.PORT, DEFAULT_CONFIG.port),
    logLevel: envString(env.LOG_LEVEL, '') || DEFAULT_CONFIG.logLevel,
    dataDir: envString(env.DATA_DIR, DEFAULT_CONFIG.dataDir),
    sessionSecret: String(env.SESSION_SECRET ?? '').trim(),
    sessionCookieName: envString(env.SESSION_COOKIE_NAME, DEFAULT_CONFIG.sessionCookieName),
    sessionMaxAgeSeconds: envNumber(env.SESSION_MAX_AGE_SECONDS, DEFAULT_CONFIG.sessionMaxAgeSeconds),
    cookieSecure: envFlag(env.COOKIE_SECURE, DEFAULT_CONFIG.cookieSecure),
    cookieSameSite: envSameSite(env.COOKIE_SAME_SITE, DEFAULT_CONFIG.cookieSameSite),
    trustProxy: envFlag(env.TRUST_PROXY, DEFAULT_CONFIG.trustProxy),
    httpTimeoutMs: envNumber(env.HTTP_TIMEOUT_MS, DEFAULT_CONFIG.httpTimeoutMs),
    ...overrides,
  }
}
