#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { AccountRepository } from '../src/modules/accounts/account.repository.js'
import { AccountService } from '../src/modules/accounts/account.service.js'
import { Ec2InstanceRepository } from '../src/modules/ec2/ec2.repository.js'
import { LightsailInstanceRepository } from '../src/modules/lightsail/lightsail.repository.js'
import { NewbieTaskRepository } from '../src/modules/newbie/newbie.repository.js'
import { NewbieTaskService } from '../src/modules/newbie/newbie.service.js'
import { AccountRemovalWorkflow } from '../src/workflows/account-management/account-removal.workflow.js'
import { JsonStore } from '../src/platform/storage/json-store.js'
import type { NewbieTask } from '../src/shared/aws/aws.types.js'

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'aws-account-integrity-'))
try {
  const accountRepository = new AccountRepository(new JsonStore('accounts.json', { items: [] }, root))
  const accounts = new AccountService(accountRepository)
  await accounts.create({ id: 'old', access_key: 'AKIA_PROBE', secret_key: 'probe-secret' })
  const lightsail = new LightsailInstanceRepository(new JsonStore('lightsail.json', { items: [] }, root), accounts)
  const ec2 = new Ec2InstanceRepository(new JsonStore('ec2.json', { items: [] }, root), accounts)
  const tasks = new NewbieTaskRepository(new JsonStore('newbie.json', { items: [] }, root))
  const newbie = new NewbieTaskService(accounts, tasks, {} as never)
  const workflow = new AccountRemovalWorkflow(accounts, lightsail, ec2, newbie)

  let releaseLookup!: () => void
  const lookupGate = new Promise<void>((resolve) => {
    releaseLookup = resolve
  })
  const originalRequire = accounts.requireAccount.bind(accounts)
  let delayed = true
  accounts.requireAccount = async (id: string) => {
    if (delayed) {
      delayed = false
      await lookupGate
    }
    return originalRequire(id)
  }
  const lateWrite = lightsail.replaceScope('old', 'us-east-1', [
    { account_id: 'old', region: 'us-east-1', name: 'late' } as never,
  ])
  await Promise.resolve()
  const deletion = workflow.delete('old')
  releaseLookup()
  await lateWrite
  await deletion
  assert.deepEqual(await lightsail.itemsByAccount('old'), [], 'account deletion must not leave a late child write')

  await accounts.create({ id: 'busy', access_key: 'AKIA_PROBE', secret_key: 'probe-secret' })
  const active: NewbieTask = {
    id: '0123456789abcdef',
    account_id: 'busy',
    step: 'lambda',
    step_label: 'Lambda',
    status: 'pending',
    phase: 'pending',
    message: 'pending',
    logs: [],
    created_at: Date.now(),
    updated_at: Date.now(),
  }
  await new JsonStore<{ items: NewbieTask[] }>('newbie.json', { items: [] }, root).write({ items: [active] })
  await assert.rejects(
    () => workflow.delete('busy'),
    (error: any) => error?.code === 'account_has_active_newbie_task'
  )
  assert.ok(await accounts.requireAccount('busy'), 'account with an active Newbie task must be preserved')

  const store = new JsonStore<{ value: number }>('write-race.json', { value: 0 }, root)
  await Promise.all([
    store.write({ value: 1 }),
    store.transaction((current) => ({ next: { value: current.value + 1 } })),
  ])
  assert.equal(typeof (await store.read()).value, 'number')

  console.log('account-integrity-probe=ok orphan_fence=1 newbie_reference=1 json_write_lock=1')
} finally {
  await fs.rm(root, { recursive: true, force: true })
}
