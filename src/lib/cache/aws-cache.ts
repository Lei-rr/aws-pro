import { cacheManager, type CacheReadMode, type CacheResult } from './cache-manager.js'

export type { CacheReadMode }

export type CacheMeta = {
  cache: boolean
  cached: boolean
  /** Where the value came from for this response. */
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
  // Match CacheManager: respect explicit cacheOnly; otherwise default to cache-only when not refreshing.
  const explicit =
    Object.prototype.hasOwnProperty.call(input, 'cache_only') || Object.prototype.hasOwnProperty.call(input, 'cacheOnly')
  const cacheOnly = explicit ? Boolean(input.cache_only ?? input.cacheOnly) : !refresh
  return { refresh, cacheOnly }
}

export function awsAccountTags(accountId: string, ...extra: string[]): string[] {
  const tags = [`aws:${accountId}`]
  for (const tag of extra) {
    if (tag) tags.push(tag.startsWith('aws:') ? tag : `aws:${tag}:${accountId}`)
  }
  return tags
}

function mapResult<T>(result: CacheResult<T>, sourceOnLoad: 'aws' | 'local'): CachedResult<T> {
  const source: CacheMeta['source'] =
    result.meta.source === 'memory'
      ? 'cache'
      : result.meta.source === 'miss'
        ? 'cache_miss'
        : sourceOnLoad

  return {
    value: result.value,
    hit: result.hit,
    meta: {
      cache: result.meta.cache,
      cached: result.meta.cached,
      source,
    },
  }
}

/**
 * Memory-only helper for reconstructable AWS lookups / local list hot cache.
 * - refresh=false + cacheOnly=true  => only memory; miss returns emptyOnMiss
 * - refresh=false + cacheOnly=false => memory miss runs loader (local JSON / etc.)
 * - refresh=true                    => always run loader and store in memory
 */
export async function withAwsCache<T>(options: {
  key: string | { prefix: string; parts: Record<string, unknown> }
  tags?: string[]
  ttlMs?: number
  mode?: CacheReadMode
  emptyOnMiss?: T
  loader: () => Promise<T>
  /** What loader represents: remote AWS API or local durable data. Default aws. */
  sourceOnLoad?: 'aws' | 'local'
}): Promise<CachedResult<T>> {
  const result = await cacheManager.getOrLoad<T>({
    key: options.key,
    tags: options.tags,
    ttlMs: options.ttlMs ?? CacheTtl.awsLookup,
    mode: options.mode,
    emptyOnMiss: options.emptyOnMiss,
    loader: options.loader,
  })
  return mapResult(result, options.sourceOnLoad ?? 'aws')
}

export function invalidateAwsCache(tags: string[]): void {
  cacheManager.invalidate({ tags })
}

export { buildCacheKey, cacheManager, globalCache } from './cache-manager.js'
