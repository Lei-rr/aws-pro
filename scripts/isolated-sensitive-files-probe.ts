#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { buildApp } from '../server/src/app.js'
import { resolveSessionSecret } from '../server/src/shared/auth/session-secret.js'
import { JsonStore, setDataRoot } from '../server/src/platform/storage/json-store.js'
import type { AppConfig } from '../server/src/bootstrap/app-config.js'

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'aws-sensitive-'))
const mode = async (file: string) => (await fs.stat(file)).mode & 0o777
try {
  setDataRoot(root)
  const existingFiles = [
    ['config.json', { auth: { username: 'existing', password: 'existing' } }],
    ['accounts.json', { items: [] }],
    ['lightsail-instances.json', { items: [] }],
    ['ec2-instances.json', { items: [] }],
    ['newbie-tasks.json', { items: [] }],
  ] as const
  for (const [file, value] of existingFiles) {
    await fs.writeFile(path.join(root, file), JSON.stringify(value, null, 2) + '\n', { mode: 0o644 })
  }
  const existingContent = new Map(
    await Promise.all(
      existingFiles.map(async ([file]) => [file, await fs.readFile(path.join(root, file), 'utf8')] as const)
    )
  )
  const secret = await resolveSessionSecret(root, '')
  const config: AppConfig = {
    host: '127.0.0.1',
    port: 0,
    logLevel: false,
    dataDir: root,
    sessionSecret: secret,
    sessionCookieName: 'probe',
    sessionMaxAgeSeconds: 3600,
    cookieSecure: false,
    cookieSameSite: 'lax',
    trustProxy: false,
    httpTimeoutMs: 1000,
  }
  const app = await buildApp(config)
  await app.close()

  const configPath = path.join(root, 'config.json')
  assert.deepEqual(JSON.parse(await fs.readFile(configPath, 'utf8')), {
    auth: { username: 'existing', password: 'existing' },
  })
  for (const [file] of existingFiles) {
    assert.equal(await mode(path.join(root, file)), 0o600, `${file} must be private immediately after startup`)
    assert.equal(await fs.readFile(path.join(root, file), 'utf8'), existingContent.get(file))
  }
  assert.equal(await mode(path.join(root, 'session-secret')), 0o600)

  const store = new JsonStore('accounts.json', { items: [] as Array<{ id: string }> })
  await store.write({ items: [{ id: 'one' }] })
  assert.equal(await mode(path.join(root, 'accounts.json')), 0o600)

  await fs.chmod(path.join(root, 'accounts.json'), 0o644)
  const before = await fs.readFile(path.join(root, 'accounts.json'), 'utf8')
  store.invalidateMemory()
  await store.read()
  assert.equal(await mode(path.join(root, 'accounts.json')), 0o600)
  assert.equal(await fs.readFile(path.join(root, 'accounts.json'), 'utf8'), before)

  await fs.chmod(path.join(root, 'session-secret'), 0o644)
  const secretBefore = await fs.readFile(path.join(root, 'session-secret'), 'utf8')
  assert.equal(await resolveSessionSecret(root, ''), secret)
  assert.equal(await mode(path.join(root, 'session-secret')), 0o600)
  assert.equal(await fs.readFile(path.join(root, 'session-secret'), 'utf8'), secretBefore)

  const missingRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'aws-sensitive-default-'))
  try {
    setDataRoot(missingRoot)
    const missingSecret = await resolveSessionSecret(missingRoot, '')
    const missingApp = await buildApp({ ...config, dataDir: missingRoot, sessionSecret: missingSecret })
    await missingApp.close()
    assert.deepEqual(JSON.parse(await fs.readFile(path.join(missingRoot, 'config.json'), 'utf8')), {
      auth: { username: 'admin', password: 'admin' },
    })
    assert.equal(await mode(path.join(missingRoot, 'config.json')), 0o600)
  } finally {
    await fs.rm(missingRoot, { recursive: true, force: true })
  }

  console.log('sensitive-files-probe=ok mode=600 default=admin/admin')
} finally {
  await fs.rm(root, { recursive: true, force: true })
}
