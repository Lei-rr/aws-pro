#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { NewbieTaskRunner } from '../server/src/modules/newbie/newbie.runner.js'
import { NewbieTaskRepository } from '../server/src/modules/newbie/newbie.repository.js'
import { NewbieTaskService } from '../server/src/modules/newbie/newbie.service.js'
import { NewbieTaskLeaseLostException } from '../server/src/modules/newbie/newbie-lease-lost.js'
import { withAwsRetry } from '../server/src/shared/aws/aws-retry.js'
import { JsonStore } from '../server/src/platform/storage/json-store.js'
import type { AwsAccount, NewbieTask } from '../server/src/shared/aws/aws.types.js'

const account: AwsAccount = { id: 'probe', access_key: 'AKIA_PROBE', secret_key: 'probe-secret' }

let cancelled = false
let lambdaDeletes = 0
let roleDeletes = 0
const lambdaRunner = new NewbieTaskRunner({
  iam: () => ({}),
  lambda: () => ({ send: async () => ({ Configuration: { State: 'Pending' } }) }),
} as never)
const lambda = lambdaRunner as unknown as Record<string, (...args: any[]) => any>
lambda.createOrGetRole = async () => ({ Role: { Arn: 'arn:probe' } })
lambda.createLambdaFunction = async () => {
  cancelled = true
}
lambda.deleteLambdaFunction = async () => {
  lambdaDeletes += 1
}
lambda.deleteIamRole = async () => {
  roleDeletes += 1
}
lambda.sleep = async () => undefined
await lambda.taskLambda(
  account,
  'lambda-op',
  () => undefined,
  () => cancelled,
  async () => undefined,
  async () => undefined
)
assert.equal(lambdaDeletes, 1, 'Lambda cancellation after create must still delete function')
assert.equal(roleDeletes, 1, 'Lambda cancellation after create must still delete role')

let fenceChecks = 0
lambdaDeletes = 0
roleDeletes = 0
cancelled = false
await assert.rejects(
  () =>
    lambda.taskLambda(
      account,
      'lambda-fence',
      () => undefined,
      () => cancelled,
      async () => undefined,
      async () => {
        fenceChecks += 1
        if (fenceChecks > 3) throw new NewbieTaskLeaseLostException()
      }
    ),
  NewbieTaskLeaseLostException
)
assert.equal(lambdaDeletes, 1, 'current owner may perform the first cleanup side effect')
assert.equal(roleDeletes, 0, 'old worker must stop before the next cleanup side effect')

let retryAttempts = 0
let retryCancelled = false
await assert.rejects(
  () =>
    withAwsRetry(
      'guarded retry',
      async () => {
        retryAttempts += 1
        retryCancelled = true
        throw Object.assign(new Error('retryable'), { name: 'InternalError' })
      },
      [],
      async () => {
        if (retryCancelled) throw new Error('cancelled-before-retry')
      }
    ),
  /cancelled-before-retry/
)
assert.equal(retryAttempts, 1, 'cancelled Newbie work must not issue a second AWS retry attempt')

let cleanupSends = 0
let cleanupOwnershipChecks = 0
const cleanupRetryRunner = new NewbieTaskRunner({} as never) as unknown as Record<string, (...args: any[]) => any>
await assert.rejects(
  () =>
    cleanupRetryRunner.deleteLambdaFunction(
      {
        send: async () => {
          cleanupSends += 1
          throw Object.assign(new Error('retryable cleanup'), { name: 'InternalError' })
        },
      },
      'fn-retry-fence',
      () => undefined,
      async () => {
        cleanupOwnershipChecks += 1
        if (cleanupOwnershipChecks > 1) throw new NewbieTaskLeaseLostException()
      }
    ),
  NewbieTaskLeaseLostException
)
assert.equal(cleanupSends, 1, 'lease takeover must stop cleanup before the second AWS retry attempt')

let releaseDrain!: () => void
const blockedJob = new Promise<void>((resolve) => {
  releaseDrain = resolve
})
const draining = new NewbieTaskService({} as never, {} as never, {} as never) as unknown as {
  jobs: Map<string, Promise<void>>
  close(): Promise<void>
}
draining.jobs.set('blocked', blockedJob)
void blockedJob.finally(() => draining.jobs.delete('blocked'))
let drainClosed = false
const drainPromise = draining.close().then(() => {
  drainClosed = true
})
await new Promise((resolve) => setTimeout(resolve, 10))
assert.equal(drainClosed, false, 'Newbie close must wait for active background work')
releaseDrain()
await drainPromise
assert.equal(drainClosed, true)

cancelled = false
let rdsDeletes = 0
const rdsClient = {
  send: async (command: { constructor: { name: string } }) => {
    if (command.constructor.name === 'CreateDBInstanceCommand') {
      cancelled = true
      return { DBInstance: { DBInstanceIdentifier: 'db-probe' } }
    }
    return {}
  },
}
const rdsRunner = new NewbieTaskRunner({ rds: () => rdsClient } as never)
const rds = rdsRunner as unknown as Record<string, (...args: any[]) => any>
rds.reconcileRdsInstance = async () => true
rds.rdsStatus = async () => 'creating'
rds.cleanupRds = async () => {
  rdsDeletes += 1
}
await rds.taskRds(
  account,
  'rds-op',
  () => undefined,
  () => cancelled,
  async () => undefined,
  async () => undefined
)
assert.equal(rdsDeletes, 1, 'RDS cancellation after create must still delete database')

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'aws-newbie-terminal-'))
try {
  const task: NewbieTask = {
    id: '0123456789abcdef',
    account_id: 'probe',
    step: 'lambda',
    step_label: 'Lambda',
    status: 'cancelling',
    phase: 'cleaning',
    message: 'cancelling',
    logs: ['start'],
    log_start_seq: 1,
    next_log_seq: 2,
    resources: { lambda_function_name: 'fn' },
    worker_token: 'worker-a',
    worker_lease_until: Date.now() + 30_000,
    created_at: Date.now(),
    updated_at: Date.now(),
  }
  const repo = new NewbieTaskRepository(new JsonStore('newbie-tasks.json', { items: [task] }, root))
  await repo.finalizeCleanup('0123456789abcdef', 'worker-a', 'cancelled', 'cancelled after cleanup', 'cleanup done')
  const final = await repo.find('0123456789abcdef')
  assert.equal(final?.status, 'cancelled')
  assert.equal(final?.phase, 'done')
  assert.equal(final?.worker_token, undefined)
  assert.equal(final?.worker_lease_until, undefined)
  assert.equal(final?.logs?.at(-1), 'cleanup done')
  assert.equal(final?.next_log_seq, 3)

  const expired: NewbieTask = { ...task, id: 'fedcba9876543210', worker_lease_until: Date.now() - 1 }
  const expiredRepo = new NewbieTaskRepository(new JsonStore('expired.json', { items: [expired] }, root))
  assert.equal(await expiredRepo.ownsExecution(expired.id, 'worker-a'), false)
  await assert.rejects(() => expiredRepo.finalizeCleanup(expired.id, 'worker-a', 'failed', 'bad', 'must not write'))
  assert.equal((await expiredRepo.find(expired.id))?.status, 'cancelling')

  console.log(
    'newbie-reliability-probe=ok lambda_cleanup=1 rds_cleanup=1 terminal_atomic=1 lease_fence=1 side_effect_fence=1 retry_fence=1 cleanup_retry_fence=1 drain=1'
  )
} finally {
  await fs.rm(root, { recursive: true, force: true })
}
