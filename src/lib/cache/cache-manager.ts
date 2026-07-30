import { globalCache } from './cache-service.js'
import { buildCacheKey } from './cache-helpers.js'

export type CacheReadMode = {
  refresh?: boolean
  /** When true and no cache hit, do not call loader. */
  cacheOnly?: boolean
}

export type CacheSource = 'memory' | 'loader' | 'miss'

export type CacheMeta = {
  cache: boolean
  cached: boolean
  source: CacheSource
}

export type CacheResult<T> = {
  value: T
  hit: boolean
  meta: CacheMeta
}

export type CacheGetOrLoadOptions<T> = {
  key: string | { prefix: string; parts: Record<string, unknown> }
  ttlMs: number
  tags?: string[]
  mode?: CacheReadMode
  emptyOnMiss?: T
  loader?: () => Promise<T>
}

function resolveKey(key: string | { prefix: string; parts: Record<string, unknown> }): string {
  return typeof key === 'string' ? key : buildCacheKey(key.prefix, key.parts)
}

/**
 * Memory-only cache facade for reconstructable query results.
 * Local durable data should use JsonStore (file + memory), not this module.
 */
export class CacheManager {
  private generation = 0
  private readonly tagGenerations = new Map<string, number>()
  private readonly keyGenerations = new Map<string, number>()

  async getOrLoad<T>(options: CacheGetOrLoadOptions<T>): Promise<CacheResult<T>> {
    const mode = {
      refresh: Boolean(options.mode?.refresh),
      // Normal reads are cache-first, not cache-only: a cold miss must run loader and populate memory.
      // cacheOnly remains an explicit internal escape hatch.
      cacheOnly: Boolean(options.mode?.cacheOnly),
    }
    const key = resolveKey(options.key)
    const tags = options.tags ?? []
    const ttlMs = options.ttlMs
    const startedAt = this.generation

    if (!mode.refresh) {
      const memoryHit = globalCache.get<T>(key)
      if (memoryHit !== undefined) {
        return {
          value: memoryHit,
          hit: true,
          meta: { cache: true, cached: true, source: 'memory' },
        }
      }

      if (mode.cacheOnly || !options.loader) {
        return {
          value: options.emptyOnMiss as T,
          hit: false,
          meta: { cache: false, cached: false, source: 'miss' },
        }
      }
    } else if (!options.loader) {
      return {
        value: options.emptyOnMiss as T,
        hit: false,
        meta: { cache: false, cached: false, source: 'miss' },
      }
    }

    const value = await options.loader!()
    if (!this.invalidatedSince(key, tags, startedAt)) {
      globalCache.set(key, value, ttlMs, tags)
    }
    return {
      value,
      hit: false,
      meta: { cache: false, cached: false, source: 'loader' },
    }
  }

  invalidate(options: { tags?: string[]; keys?: string[] }): void {
    const tags = options.tags ?? []
    const keys = options.keys ?? []
    const generation = ++this.generation
    for (const tag of tags) this.tagGenerations.set(tag, generation)
    for (const key of keys) this.keyGenerations.set(key, generation)
    if (tags.length) globalCache.invalidateTags(tags)
    for (const key of keys) globalCache.delete(key)
  }

  private invalidatedSince(key: string, tags: string[], startedAt: number): boolean {
    if ((this.keyGenerations.get(key) ?? 0) > startedAt) return true
    return tags.some((tag) => (this.tagGenerations.get(tag) ?? 0) > startedAt)
  }

  stats() {
    return globalCache.stats()
  }
}

export const cacheManager = new CacheManager()
export { buildCacheKey, globalCache }
