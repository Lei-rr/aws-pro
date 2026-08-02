#!/usr/bin/env node
import assert from 'node:assert/strict'
import { AccountRemovalWorkflow } from '../server/src/workflows/account-management/account-removal.workflow.js'
import { LightsailProvider } from '../server/src/modules/lightsail/lightsail.client.js'
import { Ec2Provider } from '../server/src/modules/ec2/ec2.client.js'
import { withAwsCache } from '../server/src/platform/cache/aws-cache.js'
import { memoryCache } from '../server/src/platform/cache/memory-cache.js'
import { toAwsApiError } from '../server/src/shared/aws/aws-error.js'
import { ApiError } from '../server/src/shared/http/api-error.js'
import type { AwsAccount } from '../server/src/shared/aws/aws.types.js'

const account: AwsAccount = { id: 'probe', access_key: 'AKIA_PROBE', secret_key: 'probe-secret' }

// ---------------------------------------------------------------------------
// 1) Account removal: failed compensate (restore) must surface as composite error
// ---------------------------------------------------------------------------
const originalError = new Error('primary delete failed')
const restoreError = new Error('restore failed: disk full')
const accounts = { requireAccount: async () => account, runSerialMutation: async (fn: () => Promise<void>) => fn() }
const newbie = { assertAccountRemovable: async () => undefined }
const failingLightsail = {
  itemsByAccount: async () => [{ account_id: 'probe', region: 'us-east-1', name: 'vm-1' } as never],
  deleteByAccount: async () => {
    throw originalError
  },
  replaceAccount: async () => {
    throw restoreError
  },
}
const okEc2 = {
  itemsByAccount: async () => [],
  deleteByAccount: async () => undefined,
  replaceAccount: async () => undefined,
}

let removalError: any
try {
  await new AccountRemovalWorkflow(
    accounts as never,
    failingLightsail as never,
    okEc2 as never,
    newbie as never
  ).delete('probe')
} catch (error) {
  removalError = error
}
assert.ok(removalError instanceof Error, 'account removal must reject when delete fails')
assert.match(
  String(removalError.message),
  /restore failed: disk full/,
  'composite error must surface the restore failure, not only the original error'
)
assert.ok(Array.isArray(removalError.cleanupErrors), 'composite error must carry cleanupErrors')
assert.equal(removalError.cleanupErrors.length, 1, 'cleanupErrors must contain every failed restore')
assert.equal(removalError.cause, originalError, 'composite error must keep the original error as cause')

// restore success => original error is rethrown untouched
const okLightsail = {
  itemsByAccount: async () => [],
  deleteByAccount: async () => {
    throw originalError
  },
  replaceAccount: async () => undefined,
}
let rethrown: any
try {
  await new AccountRemovalWorkflow(accounts as never, okLightsail as never, okEc2 as never, newbie as never).delete(
    'probe'
  )
} catch (error) {
  rethrown = error
}
assert.equal(rethrown, originalError, 'original error rethrown as-is when restore succeeds')

// ---------------------------------------------------------------------------
// 2) Lightsail / EC2 sync: malformed HTTP 200 empty object must fail closed (502)
// ---------------------------------------------------------------------------
const assertMalformed = async (promise: Promise<unknown>, label: string) => {
  let error: any
  try {
    await promise
  } catch (caught) {
    error = caught
  }
  assert.ok(error instanceof ApiError, `${label} must reject with ApiError`)
  assert.equal(error.statusCode, 502, `${label} must be a structured 502`)
  assert.equal(error.code, 'aws_malformed_response', `${label} must use aws_malformed_response`)
}

const malformedStaticIps = {
  async send(command: object) {
    const name = command.constructor.name
    if (name === 'GetStaticIpsCommand') return {} // malformed: missing staticIps
    if (name === 'GetInstancesCommand') return { instances: [] }
    throw new Error(`unexpected Lightsail command: ${name}`)
  },
}
await assertMalformed(
  new LightsailProvider({ lightsail: () => malformedStaticIps } as never).instances(account, 'us-east-1'),
  'lightsail static IP list'
)

const malformedInstances = {
  async send(command: object) {
    const name = command.constructor.name
    if (name === 'GetStaticIpsCommand') return { staticIps: [] }
    if (name === 'GetInstancesCommand') return {} // malformed: missing instances
    throw new Error(`unexpected Lightsail command: ${name}`)
  },
}
await assertMalformed(
  new LightsailProvider({ lightsail: () => malformedInstances } as never).instances(account, 'us-east-1'),
  'lightsail instance list'
)

const emptyLightsail = {
  async send(command: object) {
    const name = command.constructor.name
    if (name === 'GetStaticIpsCommand') return { staticIps: [] }
    if (name === 'GetInstancesCommand') return { instances: [] }
    throw new Error(`unexpected Lightsail command: ${name}`)
  },
}
assert.deepEqual(
  await new LightsailProvider({ lightsail: () => emptyLightsail } as never).instances(account, 'us-east-1'),
  [],
  'explicit empty arrays must still be treated as no instances'
)

const malformedAddresses = {
  async send(command: object) {
    const name = command.constructor.name
    if (name === 'DescribeAddressesCommand') return {} // malformed: missing Addresses
    if (name === 'DescribeInstancesCommand') return { Reservations: [] }
    throw new Error(`unexpected EC2 command: ${name}`)
  },
}
await assertMalformed(
  new Ec2Provider({ ec2: () => malformedAddresses } as never).instances(account, 'us-east-1'),
  'ec2 elastic IP list'
)

const malformedReservations = {
  async send(command: object) {
    const name = command.constructor.name
    if (name === 'DescribeAddressesCommand') return { Addresses: [] }
    if (name === 'DescribeInstancesCommand') return {} // malformed: missing Reservations
    throw new Error(`unexpected EC2 command: ${name}`)
  },
}
await assertMalformed(
  new Ec2Provider({ ec2: () => malformedReservations } as never).instances(account, 'us-east-1'),
  'ec2 instance list'
)

const emptyEc2 = {
  async send(command: object) {
    const name = command.constructor.name
    if (name === 'DescribeAddressesCommand') return { Addresses: [] }
    if (name === 'DescribeInstancesCommand') return { Reservations: [] }
    throw new Error(`unexpected EC2 command: ${name}`)
  },
}
assert.deepEqual(
  await new Ec2Provider({ ec2: () => emptyEc2 } as never).instances(account, 'us-east-1'),
  [],
  'explicit empty arrays must still be treated as no instances'
)

// ---------------------------------------------------------------------------
// 3) aws-cache: a normal read started after an explicit refresh must not join
//    the pre-refresh inflight load
// ---------------------------------------------------------------------------
memoryCache.clear()
const deferred = <T>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => (resolve = done))
  return { promise, resolve }
}
const raceKey = 'refresh-join-race'
const gatedOld = deferred<string>()
const gatedRefresh = deferred<string>()
let raceLoads = 0
const first = withAwsCache({
  key: raceKey,
  loader: async () => {
    raceLoads += 1
    await gatedOld.promise
    return 'OLD'
  },
})
await Promise.resolve()
const refresh = withAwsCache({
  key: raceKey,
  mode: { refresh: true },
  loader: async () => {
    raceLoads += 1
    await gatedRefresh.promise
    return 'REFRESH'
  },
})
await Promise.resolve()
const third = withAwsCache({
  key: raceKey,
  loader: async () => {
    raceLoads += 1
    return 'THIRD'
  },
})
gatedRefresh.resolve('REFRESH')
gatedOld.resolve('OLD')
assert.equal((await refresh).value, 'REFRESH')
assert.equal((await first).value, 'OLD')
assert.equal((await third).value, 'THIRD', 'read after refresh must not join the pre-refresh inflight load')
assert.equal(raceLoads, 3, 'read after refresh must start its own load')
const fourth = await withAwsCache({ key: raceKey, loader: async () => 'UNEXPECTED' })
assert.equal(fourth.value, 'THIRD', 'only the newest load generation may populate the cache')
assert.equal(fourth.hit, true)

// ---------------------------------------------------------------------------
// 4) toAwsApiError: extract AWS code/status/requestId through cause / errors /
//    cleanupErrors chains
// ---------------------------------------------------------------------------
const awsError = Object.assign(new Error('The security token included in the request is invalid'), {
  name: 'UnrecognizedClientException',
  $metadata: { httpStatusCode: 403, requestId: 'req-123' },
})

const direct = toAwsApiError(awsError, 'lightsail.delete_instance')
assert.equal(direct.statusCode, 403)
assert.equal((direct.details as any).aws_error_code, 'UnrecognizedClientException')
assert.equal((direct.details as any).aws_request_id, 'req-123')
assert.equal(direct.code, 'aws_credentials_invalid')

const wrapped = Object.assign(new Error('Static IP cleanup failed; instance was not deleted'), { cause: awsError })
const viaCause = toAwsApiError(wrapped, 'lightsail.delete_instance')
assert.equal(viaCause.statusCode, 403, 'status must come from the cause chain')
assert.equal(
  (viaCause.details as any).aws_error_code,
  'UnrecognizedClientException',
  'code must come from the cause chain'
)
assert.equal((viaCause.details as any).aws_request_id, 'req-123', 'requestId must come from the cause chain')
assert.equal(viaCause.code, 'aws_credentials_invalid', 'credential detection must use the cause chain code')

const cleanupFailure = Object.assign(new Error('restore failed: disk full'), { name: 'DiskFull', statusCode: 500 })
const composite = Object.assign(new Error('Account removal failed and restore also failed'), {
  cause: awsError,
  cleanupErrors: [cleanupFailure],
})
const viaComposite = toAwsApiError(composite, 'account.delete')
assert.equal(viaComposite.statusCode, 403, 'best AWS node in cleanupErrors chain must win')
assert.equal((viaComposite.details as any).aws_error_code, 'UnrecognizedClientException')
assert.equal((viaComposite.details as any).aws_request_id, 'req-123')
assert.match(viaComposite.message, /Account removal failed/, 'top-level message must be preserved')

const innerApi = new ApiError('lightsail_static_ip_unavailable', 'IPv6-only instances cannot bind a static IPv4', 422, {
  instance: 'vm-1',
})
const wrappedApi = Object.assign(new Error('allocate failed: IPv6-only instances cannot bind a static IPv4'), {
  cause: innerApi,
})
const viaApi = toAwsApiError(wrappedApi, 'lightsail.allocate_static_ip')
assert.equal(viaApi.statusCode, 422, 'ApiError in cause chain keeps its status')
assert.equal(
  (viaApi.details as any).aws_error_code,
  'lightsail_static_ip_unavailable',
  'ApiError in cause chain keeps its code'
)

console.log(
  'p1-hardening-probe=ok composite_restore=1 fail_closed_lightsail=2 fail_closed_ec2=2 explicit_empty=2 refresh_join_fence=1 aws_chain_fidelity=4'
)
