import { memoryCache } from './memory-cache.js'

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

type CacheKey = string | { prefix: string; parts: Record<string, unknown> }

type AwsCacheOptions<T> = {
  key: CacheKey
  tags?: string[]
  mode?: CacheReadMode
  emptyOnMiss?: T
  loader: () => Promise<T>
  sourceOnLoad?: 'aws' | 'local'
}

const keyGenerations = new Map<string, number>()
const tagGenerations = new Map<string, number>()
const loadGenerations = new Map<string, number>()
type InflightLoad = {
  promise: Promise<CachedResult<unknown>>
  keyGeneration: number
  tagGenerations: ReadonlyArray<readonly [string, number]>
}
const inflight = new Map<string, InflightLoad>()

export function parseCacheMode(input: {
  refresh?: unknown
  cache_only?: unknown
  cacheOnly?: unknown
}): Required<CacheReadMode> {
  const flag = (value: unknown) =>
    value === true || value === 1 || (typeof value === 'string' && ['1', 'true'].includes(value.trim().toLowerCase()))
  return {
    refresh: flag(input.refresh),
    cacheOnly: flag(input.cache_only ?? input.cacheOnly),
  }
}

/**
 * Permanent memory cache for reconstructable AWS/local reads.
 * Normal cold reads load once; cache-only misses stay empty; refresh bypasses and replaces.
 */
export async function withAwsCache<T>(options: AwsCacheOptions<T>): Promise<CachedResult<T>> {
  const key = resolveKey(options.key)
  const tags = options.tags ?? []
  const mode = { refresh: options.mode?.refresh === true, cacheOnly: options.mode?.cacheOnly === true }

  if (!mode.refresh) {
    const hit = memoryCache.get<T>(key)
    if (hit !== undefined) return cached(hit)
    if (mode.cacheOnly) return missed(options.emptyOnMiss as T)
    const pending = inflight.get(key)
    if (
      pending &&
      pending.keyGeneration === (keyGenerations.get(key) ?? 0) &&
      pending.tagGenerations.every(([tag, generation]) => generation === (tagGenerations.get(tag) ?? 0))
    ) {
      return pending.promise as Promise<CachedResult<T>>
    }
  }

  const fence = {
    key: keyGenerations.get(key) ?? 0,
    tags: tags.map((tag) => [tag, tagGenerations.get(tag) ?? 0] as const),
    load: (loadGenerations.get(key) ?? 0) + 1,
  }
  loadGenerations.set(key, fence.load)
  const loading = (async (): Promise<CachedResult<T>> => {
    const value = await options.loader()
    const current =
      fence.key === (keyGenerations.get(key) ?? 0) &&
      fence.load === (loadGenerations.get(key) ?? 0) &&
      fence.tags.every(([tag, generation]) => generation === (tagGenerations.get(tag) ?? 0))
    if (current) memoryCache.set(key, value, tags)
    return loaded(value, options.sourceOnLoad ?? 'aws')
  })()
  if (!mode.refresh) {
    inflight.set(key, {
      promise: loading,
      keyGeneration: fence.key,
      tagGenerations: fence.tags,
    })
  }
  try {
    return await loading
  } finally {
    if (inflight.get(key)?.promise === loading) inflight.delete(key)
  }
}

export function invalidateAwsCache(tags: string[], keys: CacheKey[] = []): void {
  for (const tag of tags) tagGenerations.set(tag, (tagGenerations.get(tag) ?? 0) + 1)
  const resolvedKeys = keys.map(resolveKey)
  for (const key of resolvedKeys) keyGenerations.set(key, (keyGenerations.get(key) ?? 0) + 1)
  memoryCache.invalidateTags(tags)
  for (const key of resolvedKeys) memoryCache.delete(key)
}

export function awsCacheStats(): { size: number } {
  return memoryCache.stats()
}

export function awsAccountTag(accountId: string): string {
  return `aws:${accountId}`
}

export function awsResourceTag(accountId: string, resource: string): string {
  return `aws:${resource}:${accountId}`
}

export function awsAccountTags(accountId: string, ...resources: string[]): string[] {
  return [awsAccountTag(accountId), ...resources.filter(Boolean).map((resource) => awsResourceTag(accountId, resource))]
}

export function buildCacheKey(prefix: string, parts: Record<string, unknown>): string {
  return [
    prefix,
    ...Object.entries(parts)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(stableValue(value))}`),
  ].join(':')
}

function resolveKey(key: CacheKey): string {
  return typeof key === 'string' ? key : buildCacheKey(key.prefix, key.parts)
}

function stableValue(value: unknown): string {
  if (value === null) return 'null:'
  if (value === undefined) return 'undefined:'
  if (typeof value === 'boolean') return `boolean:${value ? '1' : '0'}`
  if (typeof value === 'number') return `number:${String(value)}`
  if (typeof value === 'string') return `string:${value}`
  if (Array.isArray(value)) return `array:[${value.map(stableValue).join(',')}]`
  if (value && typeof value === 'object') {
    return `object:{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableValue(child)}`)
      .join(',')}}`
  }
  return `${typeof value}:${String(value)}`
}

function cached<T>(value: T): CachedResult<T> {
  return { value, hit: true, meta: { cache: true, cached: true, source: 'cache' } }
}

function missed<T>(value: T): CachedResult<T> {
  return { value, hit: false, meta: { cache: false, cached: false, source: 'cache_miss' } }
}

function loaded<T>(value: T, source: 'aws' | 'local'): CachedResult<T> {
  return { value, hit: false, meta: { cache: false, cached: false, source } }
}
