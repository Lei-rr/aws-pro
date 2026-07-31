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

/** Shared TTL presets for aws-pro modules. */
export const CacheTtl = {
  /** Remote AWS lookups live for the process lifetime; refresh=1 overwrites them. */
  awsLookup: Number.POSITIVE_INFINITY,
  /** Local JSON-backed lists also stay hot until mutation invalidation or restart. */
  instanceList: Number.POSITIVE_INFINITY,
} as const

export function parseCacheMode(input: {
  refresh?: unknown
  cache_only?: unknown
  cacheOnly?: unknown
}): Required<CacheReadMode> {
  const flag = (value: unknown) =>
    value === true ||
    value === 1 ||
    (typeof value === 'string' && ['1', 'true'].includes(value.trim().toLowerCase()))
  return {
    refresh: flag(input.refresh),
    cacheOnly: flag(input.cache_only ?? input.cacheOnly),
  }
}

export function awsAccountTag(accountId: string): string {
  return `aws:${accountId}`
}

export function awsResourceTag(accountId: string, resource: string): string {
  return `aws:${resource}:${accountId}`
}

export function awsAccountTags(accountId: string, ...extra: string[]): string[] {
  const tags = [awsAccountTag(accountId)]
  for (const tag of extra) {
    if (tag) tags.push(tag.startsWith('aws:') ? tag : awsResourceTag(accountId, tag))
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
 * - normal read                 => memory hit, otherwise run loader and populate memory
 * - explicit internal cacheOnly => only memory; miss returns emptyOnMiss
 * - refresh=true                => always run loader and overwrite memory
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
