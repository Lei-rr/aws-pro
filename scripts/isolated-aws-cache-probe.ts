#!/usr/bin/env node
import assert from 'node:assert/strict'
import {
  awsAccountTags,
  buildCacheKey,
  invalidateAwsCache,
  parseCacheMode,
  withAwsCache,
} from '../server/src/platform/cache/aws-cache.js'
import { memoryCache } from '../server/src/platform/cache/memory-cache.js'

const deferred = <T>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => (resolve = done))
  return { promise, resolve }
}

memoryCache.clear()
assert.notEqual(
  buildCacheKey('aws:billing', { account_id: 'acct:a' }),
  buildCacheKey('aws:billing', { account_id: 'acct_a' }),
  'cache key must be injective for colon/underscore account ids'
)
assert.deepEqual(parseCacheMode({ refresh: '1', cache_only: 0 }), { refresh: true, cacheOnly: false })
assert.deepEqual(parseCacheMode({ refresh: '0', cache_only: '1' }), { refresh: false, cacheOnly: true })

let loads = 0
const options = {
  key: { prefix: 'single', parts: { account_id: 'one' } },
  tags: awsAccountTags('one', 'billing'),
  loader: async () => {
    loads += 1
    await new Promise((resolve) => setTimeout(resolve, 10))
    return 'loaded'
  },
}
const [one, two] = await Promise.all([withAwsCache(options), withAwsCache(options)])
assert.equal(loads, 1)
assert.equal(one.value, 'loaded')
assert.equal(two.value, 'loaded')

const miss = await withAwsCache({
  key: 'cache-only-miss',
  mode: { cacheOnly: true },
  emptyOnMiss: [] as string[],
  loader: async () => {
    throw new Error('cache-only must not load')
  },
})
assert.deepEqual(miss.value, [])
assert.equal(miss.meta.source, 'cache_miss')

const old = deferred<string>()
const newer = deferred<string>()
const oldRead = withAwsCache({ key: 'refresh-race', mode: { refresh: true }, loader: () => old.promise })
const newRead = withAwsCache({ key: 'refresh-race', mode: { refresh: true }, loader: () => newer.promise })
newer.resolve('NEW')
assert.equal((await newRead).value, 'NEW')
old.resolve('OLD')
assert.equal((await oldRead).value, 'OLD')
assert.equal(
  (await withAwsCache({ key: 'refresh-race', loader: async () => 'unexpected' })).value,
  'NEW',
  'older refresh must not overwrite newer refresh'
)

const gated = deferred<string>()
const pending = withAwsCache({
  key: 'invalidate-race',
  tags: ['tag:invalidate'],
  loader: () => gated.promise,
})
invalidateAwsCache(['tag:invalidate'])
gated.resolve('STALE')
await pending
const afterInvalidate = await withAwsCache({
  key: 'invalidate-race',
  tags: ['tag:invalidate'],
  loader: async () => 'FRESH',
})
assert.equal(afterInvalidate.value, 'FRESH')

let releaseInvalidated!: () => void
const invalidatedGate = new Promise<void>((resolve) => {
  releaseInvalidated = resolve
})
let postInvalidationLoads = 0
const oldInflight = withAwsCache({
  key: { prefix: 'post-invalidation', parts: { account: 'a' } },
  tags: ['post-invalidation-tag'],
  loader: async () => {
    await invalidatedGate
    return 'OLD'
  },
})
await Promise.resolve()
invalidateAwsCache(['post-invalidation-tag'])
const newAfterInvalidation = withAwsCache({
  key: { prefix: 'post-invalidation', parts: { account: 'a' } },
  tags: ['post-invalidation-tag'],
  loader: async () => {
    postInvalidationLoads += 1
    return 'NEW'
  },
})
releaseInvalidated()
assert.equal((await oldInflight).value, 'OLD')
assert.equal((await newAfterInvalidation).value, 'NEW')
assert.equal(postInvalidationLoads, 1, 'a read after invalidation must not join the stale inflight promise')

for (let index = 0; index < 1500; index += 1) {
  await withAwsCache({ key: `capacity:${index}`, loader: async () => index })
}
assert.ok(memoryCache.stats().size >= 1500, 'process-lifetime cache must not evict by capacity')

console.log(
  'aws-cache-probe=ok injective=1 singleflight=1 refresh_fence=1 invalidation_fence=1 inflight_fence=1 capacity=1500'
)
