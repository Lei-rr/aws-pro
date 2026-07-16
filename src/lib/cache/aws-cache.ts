import { globalCache } from './cache-service.js'
import { buildCacheKey } from './cache-helpers.js'

export type CacheReadMode = {
  refresh?: boolean
  cacheOnly?: boolean
}

export type CacheMeta = {
  cache: boolean
  cached: boolean
  source: 'cache' | 'cache_miss' | 'aws' | 'local'
}

export type CachedResult<T> = {
  value: T
  meta: CacheMeta
  hit: boolean
}

const HOUR = 60 * 60 * 1000
const MINUTE = 60 * 1000

/** Shared TTL presets for aws-pro modules. */
export const CacheTtl = {
  /** Regions / quotas / billing: long-lived until manual refresh. */
  awsLookup: 24 * HOUR,
  /** Lightsail/EC2 list memory cache over local JSON. */
  instanceList: 5 * MINUTE,
} as const

export function parseCacheMode(input: {
  refresh?: unknown
  cache_only?: unknown
  cacheOnly?: unknown
}): Required<CacheReadMode> {
  const refresh = Boolean(input.refresh)
  // Default to cache-only unless caller explicitly asks to refresh.
  const cacheOnly = Boolean(input.cache_only ?? input.cacheOnly) || !refresh
  return { refresh, cacheOnly }
}

export function awsAccountTags(accountId: string, ...extra: string[]): string[] {
  const tags = [`aws:${accountId}`]
  for (const tag of extra) {
    if (tag) tags.push(tag.startsWith('aws:') ? tag : `aws:${tag}:${accountId}`)
  }
  return tags
}

/**
 * Unified cache read/write helper used by quota/billing/regions (and reusable by others).
 *
 * Rules:
 * - refresh=false  => only read cache; miss returns empty without calling loader
 * - refresh=true   => call loader, store result, return fresh data
 */
export async function withAwsCache<T>(options: {
  key: string | { prefix: string; parts: Record<string, unknown> }
  tags?: string[]
  ttlMs?: number
  mode?: CacheReadMode
  emptyOnMiss: T
  loader: () => Promise<T>
}): Promise<CachedResult<T>> {
  const mode = {
    refresh: Boolean(options.mode?.refresh),
    cacheOnly: Boolean(options.mode?.cacheOnly) || !Boolean(options.mode?.refresh),
  }
  const key =
    typeof options.key === 'string'
      ? options.key
      : buildCacheKey(options.key.prefix, options.key.parts)
  const ttlMs = options.ttlMs ?? CacheTtl.awsLookup
  const tags = options.tags ?? []

  if (!mode.refresh) {
    const cached = globalCache.get<T>(key)
    if (cached !== undefined) {
      return {
        value: cached,
        hit: true,
        meta: { cache: true, cached: true, source: 'cache' },
      }
    }
    if (mode.cacheOnly) {
      return {
        value: options.emptyOnMiss,
        hit: false,
        meta: { cache: false, cached: false, source: 'cache_miss' },
      }
    }
  }

  const value = await options.loader()
  globalCache.set(key, value, ttlMs, tags)
  return {
    value,
    hit: false,
    meta: { cache: false, cached: false, source: 'aws' },
  }
}

export function invalidateAwsCache(tags: string[]): void {
  globalCache.invalidateTags(tags)
}

export { buildCacheKey, globalCache }
