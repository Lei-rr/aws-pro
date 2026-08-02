#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { buildApp } from '../server/src/app.js'
import { setDataRoot } from '../server/src/platform/storage/json-store.js'

const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aws-static-probe-'))
setDataRoot(dataDir)
const app = await buildApp({
  host: '127.0.0.1',
  port: 0,
  logLevel: false,
  dataDir,
  sessionSecret: 'static-probe-session-secret-that-is-longer-than-thirty-two-characters',
  sessionCookieName: 'aws_static_probe',
  sessionMaxAgeSeconds: 3600,
  cookieSecure: false,
  cookieSameSite: 'lax',
  trustProxy: false,
  httpTimeoutMs: 1000,
})

try {
  const root = await app.inject({ method: 'GET', url: '/', headers: { accept: 'text/html' } })
  assert.equal(root.statusCode, 200)
  assert.match(String(root.headers['content-type']), /^text\/html/)
  assert.match(String(root.headers['cache-control']), /no-store/)

  const references = [...root.body.matchAll(/(?:src|href)="(\/[^"?#]+)["?#]/g)].map((match) => match[1])
  assert.ok(references.length > 0)
  for (const reference of references) {
    const response = await app.inject({ method: 'GET', url: reference })
    assert.equal(response.statusCode, 200, reference)
    assert.doesNotMatch(String(response.headers['content-type']), /^text\/html/, reference)
  }

  const asset = references.find((reference) => reference.startsWith('/assets/'))
  assert.ok(asset)
  const assetResponse = await app.inject({ method: 'GET', url: asset })
  assert.match(String(assetResponse.headers['cache-control']), /immutable/)

  for (const url of ['/assets', '/assets/definitely-missing.js', '/api', '/api/definitely-missing']) {
    const missing = await app.inject({ method: 'GET', url, headers: { accept: 'text/html' } })
    assert.equal(missing.statusCode, 404, url)
    assert.match(String(missing.headers['content-type']), /^application\/json/, url)
  }

  const deepLink = await app.inject({
    method: 'GET',
    url: '/lightsail/deep-link',
    headers: { accept: 'text/html' },
  })
  assert.equal(deepLink.statusCode, 200)
  assert.match(String(deepLink.headers['content-type']), /^text\/html/)
  assert.match(String(deepLink.headers['cache-control']), /no-store/)

  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    const mutation = await app.inject({ method, url: '/unknown-page' })
    assert.equal(mutation.statusCode, 404, method)
    assert.match(String(mutation.headers['content-type']), /^application\/json/, method)
  }

  console.log(`static-probe=ok references=${references.length} negative_boundaries=8`)
} finally {
  await app.close()
  await fs.rm(dataDir, { recursive: true, force: true })
}
