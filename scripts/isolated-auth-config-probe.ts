#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { buildApp } from '../server/src/app.js'
import { resolveSessionSecret } from '../server/src/shared/auth/session-secret.js'
import { setDataRoot } from '../server/src/platform/storage/json-store.js'
import type { AppConfig } from '../server/src/bootstrap/app-config.js'

type ProbeApp = Awaited<ReturnType<typeof buildApp>>

async function boot(dataDir: string): Promise<ProbeApp> {
  setDataRoot(dataDir)
  const secret = await resolveSessionSecret(dataDir, '')
  const config: AppConfig = {
    host: '127.0.0.1',
    port: 0,
    logLevel: false,
    dataDir,
    sessionSecret: secret,
    sessionCookieName: 'auth_config_probe',
    sessionMaxAgeSeconds: 3600,
    cookieSecure: false,
    cookieSameSite: 'lax',
    trustProxy: false,
    httpTimeoutMs: 1000,
  }
  return buildApp(config)
}

function login(app: ProbeApp, username: string, password: string) {
  return app.inject({ method: 'POST', url: '/api/session', payload: { username, password } })
}

const mode = async (file: string) => (await fs.stat(file)).mode & 0o777
const body = (response: { body: string }) => JSON.parse(response.body) as Record<string, any>

const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'aws-auth-config-'))
try {
  // Case 1: config.json completely missing -> default admin/admin is generated and login works.
  const missingDir = path.join(tmpRoot, 'missing')
  await fs.mkdir(missingDir, { recursive: true })
  const missingApp = await boot(missingDir)
  try {
    const configPath = path.join(missingDir, 'config.json')
    assert.deepEqual(JSON.parse(await fs.readFile(configPath, 'utf8')), {
      auth: { username: 'admin', password: 'admin' },
    })
    assert.equal(await mode(configPath), 0o600)
    const ok = await login(missingApp, 'admin', 'admin')
    assert.equal(ok.statusCode, 200, 'missing config must fall back to generated admin/admin')
    assert.equal(body(ok).data.authenticated, true)
  } finally {
    await missingApp.close()
  }

  // Case 2: config.json exists but auth block is entirely missing -> fail closed.
  const emptyAuthDir = path.join(tmpRoot, 'empty-auth')
  await fs.mkdir(emptyAuthDir, { recursive: true })
  await fs.writeFile(path.join(emptyAuthDir, 'config.json'), JSON.stringify({}, null, 2) + '\n', { mode: 0o600 })
  const emptyAuthApp = await boot(emptyAuthDir)
  try {
    const rejected = await login(emptyAuthApp, 'admin', 'admin')
    assert.equal(rejected.statusCode, 500, 'corrupted config must not accept admin/admin')
    const parsed = body(rejected)
    assert.equal(parsed.code, 'invalid_auth_config')
    assert.match(String(parsed.details?.hint ?? ''), /auth\.username/)
    assert.deepEqual(JSON.parse(await fs.readFile(path.join(emptyAuthDir, 'config.json'), 'utf8')), {})
  } finally {
    await emptyAuthApp.close()
  }

  // Case 3: password key missing -> fail closed.
  const partialDir = path.join(tmpRoot, 'partial')
  await fs.mkdir(partialDir, { recursive: true })
  await fs.writeFile(
    path.join(partialDir, 'config.json'),
    JSON.stringify({ auth: { username: 'admin' } }, null, 2) + '\n',
    { mode: 0o600 }
  )
  const partialApp = await boot(partialDir)
  try {
    const rejected = await login(partialApp, 'admin', 'admin')
    assert.equal(rejected.statusCode, 500, 'partial auth must not fall back to admin/admin')
    assert.equal(body(rejected).code, 'invalid_auth_config')
  } finally {
    await partialApp.close()
  }

  // Case 4: empty username/password strings -> fail closed.
  const blankDir = path.join(tmpRoot, 'blank')
  await fs.mkdir(blankDir, { recursive: true })
  await fs.writeFile(
    path.join(blankDir, 'config.json'),
    JSON.stringify({ auth: { username: '', password: '' } }, null, 2) + '\n',
    { mode: 0o600 }
  )
  const blankApp = await boot(blankDir)
  try {
    const rejected = await login(blankApp, 'admin', 'admin')
    assert.equal(rejected.statusCode, 500, 'blank auth must not fall back to admin/admin')
    assert.equal(body(rejected).code, 'invalid_auth_config')
  } finally {
    await blankApp.close()
  }

  // Case 5: valid custom credentials keep working; admin/admin is rejected.
  const customDir = path.join(tmpRoot, 'custom')
  await fs.mkdir(customDir, { recursive: true })
  await fs.writeFile(
    path.join(customDir, 'config.json'),
    JSON.stringify({ auth: { username: 'custom-user', password: 'custom-pass' } }, null, 2) + '\n',
    { mode: 0o600 }
  )
  const customApp = await boot(customDir)
  try {
    const ok = await login(customApp, 'custom-user', 'custom-pass')
    assert.equal(ok.statusCode, 200, 'valid stored credentials must keep working')
    assert.equal(body(ok).data.authenticated, true)
    const denied = await login(customApp, 'admin', 'admin')
    assert.equal(denied.statusCode, 401, 'admin/admin must be rejected when custom credentials are stored')
  } finally {
    await customApp.close()
  }

  console.log(
    'auth-config-probe=ok missing_default=1 corrupted_rejected=1 partial_rejected=1 blank_rejected=1 custom_kept=1'
  )
} finally {
  await fs.rm(tmpRoot, { recursive: true, force: true })
}
