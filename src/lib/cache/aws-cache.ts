import { cacheManager, type CacheReadMode, type CacheResult } from './cache-manager.js'

export type { CacheReadMode }

export type CacheMeta = {
  cache: boolean
  cached: boolean
  source: 'cache' | 'cache_miss' | 'aws' | 'local' | 'memory' | 'file' | 'loader' | 'miss'
  store?: 'memory' | 'file' | 'layered'
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

function mapResult<T>(result: CacheResult<T>): CachedResult<T> {
  const source =
    result.meta.source === 'memory' || result.meta.source === 'file'
      ? 'cache'
      : result.meta.source === 'loader'
        ? 'aws'
        : result.meta.source === 'miss'
          ? 'cache_miss'
          : (result.meta.source as CacheMeta['source'])

  return {
    value: result.value,
    hit: result.hit,
    meta: {
      cache: result.meta.cache,
      cached: result.meta.cached,
      source,
      store: result.meta.store,
    },
  }
}

/**
 * Unified cache read/write helper used by quota/billing/regions (and reusable by others).
 *
 * Default store is memory-only for reconstructable AWS lookups:
 * - refresh=false => only read cache; miss returns empty without calling loader
 * - refresh=true  => call loader, store in memory, return fresh data
 * Restart clears cache; user refreshes again when needed.
 */
export async function withAwsCache<T>(options: {
  key: string | { prefix: string; parts: Record<string, unknown> }
  tags?: string[]
  ttlMs?: number
  mode?: CacheReadMode
  emptyOnMiss: T
  loader: () => Promise<T>
  /** Defaults to memory for reconstructable lookup data. */
  store?: 'memory' | 'file' | 'layered'
}): Promise<CachedResult<T>> {
  const result = await cacheManager.getOrLoad<T>({
    key: options.key,
    tags: options.tags,
    ttlMs: options.ttlMs ?? CacheTtl.awsLookup,
    mode: options.mode,
    emptyOnMiss: options.emptyOnMiss,
    loader: options.loader,
    store: options.store ?? 'memory',
    namespace: 'aws',
  })
  return mapResult(result)
}

export async function invalidateAwsCache(tags: string[]): Promise<void> {
  await cacheManager.invalidate({ tags, namespace: 'aws', store: 'all' })
}

export { buildCacheKey, cacheManager, globalCache } from './cache-manager.js'
