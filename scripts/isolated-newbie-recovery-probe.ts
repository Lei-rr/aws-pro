#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { setDataRoot, JsonStore } from '../server/src/platform/storage/json-store.js'
import { NewbieTaskRepository } from '../server/src/modules/newbie/newbie.repository.js'
import { NewbieTaskService } from '../server/src/modules/newbie/newbie.service.js'
import type { NewbieTask } from '../server/src/shared/aws/aws.types.js'

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'aws-newbie-recovery-'))
setDataRoot(root)

const account = { id: 'probe', access_key: 'AKIA_PROBE', secret_key: 'probe-secret' }
const TASK_ID = 'a1b2c3d4e5f6a7b8'

function seedTask(overrides: Partial<NewbieTask>): NewbieTask {
  const now = Date.now()
  return {
    id: TASK_ID,
    account_id: account.id,
    step: 'all',
    step_label: '全部任务',
    status: 'running',
    message: 'running',
    logs: [],
    log_start_seq: 1,
    next_log_seq: 1,
    operation_ids: {},
    resources: {},
    phase: 'pending',
    progress: 0,
    created_at: now,
    updated_at: now,
    ...overrides,
  }
}

async function runAndDrain(service: NewbieTaskService) {
  await service.resumeActiveJobs()
  await service.close()
}

// --- Test 1: cleanup failure must keep the task recoverable and retry after restart ---
{
  const store = new JsonStore('newbie-recovery-1.json', { items: [] })
  const repo = new NewbieTaskRepository(store)
  await store.write({
    items: [
      seedTask({
        status: 'running',
        phase: 'cleaning',
        resources: { rds_identifier: 'db-leaked' },
        worker_token: 'stale-worker',
        worker_lease_until: Date.now() - 60_000,
        updated_at: Date.now() - 60_000,
      }),
    ],
  })
  let cleanupCalls = 0
  const runner = {
    cleanup: async () => {
      cleanupCalls += 1
      throw new Error('cleanup failed')
    },
    hasStep: () => true,
    stepLabel: () => '全部任务',
  } as never
  const service = new NewbieTaskService({ requireAccount: async () => account } as never, repo, runner as never)
  await runAndDrain(service)
  assert.equal(cleanupCalls, 1, 'cleanup must run once on resume')
  const after = await repo.find(TASK_ID)
  assert.ok(after)
  assert.equal(after.status, 'running', 'cleanup failure must not terminalize the task')
  assert.equal(after.phase, 'cleaning')
  assert.ok(Object.keys(after.resources ?? {}).length > 0, 'resources must be retained for retry')
  assert.equal(after.worker_token, undefined, 'lease must be released for re-claim')

  // simulate backoff elapsed, then restart the service
  await store.transaction((current) => ({
    next: { items: (current.items ?? []).map((t) => ({ ...t, updated_at: Date.now() - 60_000 })) },
  }))
  const service2 = new NewbieTaskService({ requireAccount: async () => account } as never, repo, runner as never)
  await runAndDrain(service2)
  assert.equal(cleanupCalls, 2, 'cleanup must be retried after restart')
  const final = await repo.find(TASK_ID)
  assert.equal(final?.status, 'running')
  assert.equal(final?.phase, 'cleaning')
}

// --- Test 2: cancel requested while cleanup fails must stay cancelling and retry ---
{
  const store = new JsonStore('newbie-recovery-2.json', { items: [] })
  const repo = new NewbieTaskRepository(store)
  await store.write({
    items: [
      seedTask({
        status: 'cancelling',
        phase: 'cleaning',
        resources: { rds_identifier: 'db-cancel' },
        worker_token: 'stale-worker',
        worker_lease_until: Date.now() - 60_000,
        updated_at: Date.now() - 60_000,
      }),
    ],
  })
  let cleanupCalls = 0
  const runner = {
    cleanup: async () => {
      cleanupCalls += 1
      throw new Error('cleanup failed')
    },
    hasStep: () => true,
    stepLabel: () => '全部任务',
  } as never
  const service = new NewbieTaskService({ requireAccount: async () => account } as never, repo, runner as never)
  await runAndDrain(service)
  const after = await repo.find(TASK_ID)
  assert.equal(after?.status, 'cancelling', 'cancel with failed cleanup must stay cancelling (resumable)')
  assert.equal(after?.phase, 'cleaning')
  assert.ok(Object.keys(after?.resources ?? {}).length > 0)
}

// --- Test 3: running + phase=done must finalize without replaying the runner ---
{
  const store = new JsonStore('newbie-recovery-3.json', { items: [] })
  const repo = new NewbieTaskRepository(store)
  await store.write({
    items: [
      seedTask({
        status: 'running',
        phase: 'done',
        progress: 100,
        worker_token: 'stale-worker',
        worker_lease_until: Date.now() - 60_000,
        updated_at: Date.now() - 60_000,
      }),
    ],
  })
  let runnerRuns = 0
  const runner = {
    run: async () => {
      runnerRuns += 1
    },
  } as never
  const service = new NewbieTaskService({ requireAccount: async () => account } as never, repo, runner as never)
  await runAndDrain(service)
  assert.equal(runnerRuns, 0, 'phase=done task must not replay the full runner')
  const t = await repo.find(TASK_ID)
  assert.equal(t?.status, 'completed')
  assert.equal(t?.phase, 'done')
}

console.log('newbie-recovery-probe=ok cleanup_retained=1 cancel_retained=1 done_no_replay=1')
await fs.rm(root, { recursive: true, force: true })
