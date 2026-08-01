#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { buildApp } from '../src/app.js'
import { resolveSessionSecret } from '../src/shared/auth/session-secret.js'
import { setDataRoot } from '../src/platform/storage/json-store.js'
import type { AppConfig } from '../src/bootstrap/app-config.js'

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'aws-api-boundary-'))
try {
  await fs.writeFile(
    path.join(root, 'accounts.json'),
    JSON.stringify({ items: [{ id: 'probe', access_key: 'AKIA_PROBE', secret_key: 'probe-secret' }] }),
    { mode: 0o600 }
  )
  await fs.writeFile(
    path.join(root, 'newbie-tasks.json'),
    JSON.stringify({
      items: [
        {
          id: '0123456789abcdef',
          account_id: 'probe',
          step: 'lambda',
          step_label: 'Lambda',
          status: 'completed',
          message: 'completed',
          logs: ['done'],
          log_start_seq: 1,
          next_log_seq: 2,
          operation_ids: { lambda: 'INTERNAL_OPERATION' },
          resources: { lambda_function_name: 'INTERNAL_RESOURCE' },
          worker_token: 'INTERNAL_TOKEN',
          worker_lease_until: Date.now() + 999999,
          phase: 'done',
          progress: 100,
          created_at: Date.now(),
          updated_at: Date.now(),
        },
      ],
    }),
    { mode: 0o600 }
  )
  setDataRoot(root)
  const config: AppConfig = {
    host: '127.0.0.1',
    port: 0,
    logLevel: false,
    dataDir: root,
    sessionSecret: await resolveSessionSecret(root, ''),
    sessionCookieName: 'probe',
    sessionMaxAgeSeconds: 3600,
    cookieSecure: false,
    cookieSameSite: 'lax',
    trustProxy: false,
    httpTimeoutMs: 1000,
  }
  const app = await buildApp(config)
  try {
    for (const url of ['/api', '/assets']) {
      const response = await app.inject({ method: 'GET', url, headers: { accept: 'text/html' } })
      assert.equal(response.statusCode, 404, `${url} must not return SPA HTML`)
      assert.match(response.headers['content-type'] ?? '', /application\/json/)
      if (url === '/assets') assert.match(response.headers['cache-control'] ?? '', /no-store/)
    }
    const unknownPost = await app.inject({ method: 'POST', url: '/not-a-page', payload: {} })
    assert.equal(unknownPost.statusCode, 404)
    assert.match(unknownPost.headers['content-type'] ?? '', /application\/json/)

    const login = await app.inject({
      method: 'POST',
      url: '/api/session',
      payload: { username: 'admin', password: 'admin' },
    })
    assert.equal(login.statusCode, 200)
    const cookie = login.cookies.map((item) => `${item.name}=${item.value}`).join('; ')

    const cacheOnly = await app.inject({
      method: 'GET',
      url: '/api/regions?account_id=probe&cache_only=1',
      headers: { cookie },
    })
    assert.equal(cacheOnly.statusCode, 200)
    assert.equal(cacheOnly.json().data.meta.source, 'cache_miss')

    const recent = await app.inject({ method: 'GET', url: '/api/newbie/tasks/recent', headers: { cookie } })
    assert.equal(recent.statusCode, 200)
    const body = recent.json()
    assert.equal(body.data.id, '0123456789abcdef')
    const encoded = JSON.stringify(body)
    for (const secret of ['operation_ids', 'resources', 'worker_token', 'worker_lease_until', 'INTERNAL_']) {
      assert.equal(encoded.includes(secret), false, `Newbie response leaked ${secret}`)
    }

    console.log(
      'api-boundary-probe=ok api_root=404 assets_root=404 unknown_post=404 cache_only_1=200 newbie_internal=hidden'
    )
  } finally {
    await app.close()
  }
} finally {
  await fs.rm(root, { recursive: true, force: true })
}
