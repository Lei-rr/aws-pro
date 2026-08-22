import fs from 'node:fs/promises'
import path from 'node:path'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { success, error } from '../../shared/http/api-response.js'
import { getDataRoot } from '../../platform/storage/json-store.js'
import { awsCacheStats } from '../../platform/cache/aws-cache.js'
import { noRequestSchema, type RequestOf } from '../../shared/http/request-schema.js'
import { APP_VERSION } from '../../shared/version.js'

async function isDirectoryWritable(dir: string): Promise<boolean> {
  const probe = path.join(dir, `.health-check-${Date.now()}`)
  try {
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(probe, '')
    await fs.unlink(probe)
    return true
  } catch {
    return false
  }
}

async function isFileReadable(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath, fs.constants.R_OK)
    return true
  } catch {
    return false
  }
}

export async function healthShow(_request: FastifyRequest<RequestOf<typeof noRequestSchema>>, reply: FastifyReply) {
  const dataDir = getDataRoot()
  const [writable, configReadable] = await Promise.all([
    isDirectoryWritable(dataDir),
    isFileReadable(path.join(dataDir, 'config.json')),
  ])
  const payload = {
    status: 'ok',
    version: APP_VERSION,
    data_dir: { writable, config_readable: configReadable },
    cache: awsCacheStats(),
  }
  if (!writable) {
    return reply.status(503).send(error('health_check_failed', 503, 'health_check_failed', payload))
  }
  return reply.send(success(payload))
}

export async function configIndex(request: FastifyRequest<RequestOf<typeof noRequestSchema>>, reply: FastifyReply) {
  const cfg = await request.server.ctx.modules.system.catalog.read()
  return reply.send(success(cfg))
}
