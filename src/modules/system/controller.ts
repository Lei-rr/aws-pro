import type { FastifyReply, FastifyRequest } from 'fastify'
import { success } from '../../lib/http/api-response.js'
import { getDataRoot } from '../../lib/storage/json-store.js'
import { globalCache } from '../../lib/cache/cache-service.js'
import fs from 'node:fs/promises'
import path from 'node:path'

export async function healthShow(_request: FastifyRequest, reply: FastifyReply) {
  const dataDir = getDataRoot()
  let writable = false
  let configReadable = false
  try {
    await fs.access(dataDir)
    writable = true
  } catch {
    writable = false
  }
  try {
    await fs.access(path.join(dataDir, 'config.json'))
    configReadable = true
  } catch {
    configReadable = false
  }
  return reply.send(
    success({
      status: 'ok',
      data_dir: { path: dataDir, writable, config_readable: configReadable },
      cache: globalCache.stats(),
    }),
  )
}

export async function configIndex(request: FastifyRequest, reply: FastifyReply) {
  const cfg = await request.server.ctx.systemConfigRepository.read()
  return reply.send(success(cfg))
}
