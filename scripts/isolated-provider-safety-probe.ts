#!/usr/bin/env node
import assert from 'node:assert/strict'
import { LightsailProvider } from '../server/src/modules/lightsail/lightsail.client.js'
import { NewbieTaskRunner } from '../server/src/modules/newbie/newbie.runner.js'
import { AwsClientFactory } from '../server/src/shared/aws/aws-client.factory.js'
import { setDefaultHttpTimeout } from '../server/src/shared/http/base.client.js'
import type { AwsAccount } from '../server/src/shared/aws/aws.types.js'

const account: AwsAccount = { id: 'probe', access_key: 'AKIA_PROBE', secret_key: 'probe-secret' }

setDefaultHttpTimeout(1234)
const factory = new AwsClientFactory()
for (const client of [
  factory.lightsail(account, 'us-east-1'),
  factory.ec2(account, 'us-east-1'),
  factory.rds(account, 'us-east-1'),
]) {
  const handler = client.config.requestHandler as unknown as { configProvider?: Promise<Record<string, unknown>> }
  assert.ok(handler.configProvider, 'AWS client must use the configured NodeHttpHandler')
  const config = await handler.configProvider
  assert.equal(config.connectionTimeout, 1234)
  assert.equal(config.requestTimeout, 1234)
  assert.equal(config.socketTimeout, 1234)
  assert.equal(config.throwOnRequestTimeout, true)
  client.destroy()
}
setDefaultHttpTimeout(30_000)

let releases = 0
const lightsailClient = {
  async send(command: object) {
    const name = command.constructor.name
    if (name === 'GetStaticIpsCommand') {
      return { staticIps: [{ name: 'sip-one', attachedTo: 'vm-one', isAttached: true }] }
    }
    if (name === 'DetachStaticIpCommand') return {}
    if (name === 'GetStaticIpCommand') {
      throw Object.assign(new Error('invalid credentials'), { name: 'UnrecognizedClientException' })
    }
    if (name === 'ReleaseStaticIpCommand') {
      releases += 1
      return {}
    }
    throw new Error(`unexpected Lightsail command: ${name}`)
  },
}
const lightsail = new LightsailProvider({ lightsail: () => lightsailClient } as never)
await assert.rejects(() => lightsail.releaseStaticIp(account, 'us-east-1', 'vm-one'), /invalid credentials|credential/i)
assert.equal(releases, 0, 'Lightsail must not release a static IP after detach status lookup failed')

const runner = new NewbieTaskRunner({} as never) as unknown as Record<string, (...args: any[]) => any>
runner.sleep = async () => undefined

const rdsMissing = {
  send: async () => {
    throw Object.assign(new Error('missing'), { name: 'DBInstanceNotFoundFault' })
  },
}
assert.equal(await runner.rdsExists(rdsMissing, 'db-one'), false)
const rdsAuth = {
  send: async () => {
    throw Object.assign(new Error('invalid credentials'), { name: 'UnrecognizedClientException' })
  },
}
await assert.rejects(() => runner.rdsExists(rdsAuth, 'db-one'), /invalid credentials/)

const budgetMissing = {
  send: async () => {
    throw Object.assign(new Error('missing'), { name: 'NotFoundException' })
  },
}
assert.equal(await runner.budgetExists(budgetMissing, '123456789012', 'budget-one'), false)
const budgetAuth = {
  send: async () => {
    throw Object.assign(new Error('invalid credentials'), { name: 'UnrecognizedClientException' })
  },
}
await assert.rejects(() => runner.budgetExists(budgetAuth, '123456789012', 'budget-one'), /invalid credentials/)

console.log('provider-safety-probe=ok aws_timeout=1 lightsail_release_fence=1 rds_not_found=1 budget_not_found=1')
