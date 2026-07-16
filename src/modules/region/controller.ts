import type { FastifyReply, FastifyRequest } from 'fastify'
import { success } from '../../lib/http/api-response.js'
import { parseCacheMode } from '../../lib/cache/aws-cache.js'
import { parseBool } from '../../lib/utils/parse-bool.js'

export async function regionsIndex(request: FastifyRequest, reply: FastifyReply) {
  const q = (request.query ?? {}) as Record<string, any>
  const mode = parseCacheMode({
    refresh: parseBool(q.refresh),
    cache_only: parseBool(q.cache_only),
  })
  return reply.send(success(await request.server.ctx.regionService.list(String(q.account_id ?? ''), mode)))
}

export async function regionsEnable(request: FastifyRequest, reply: FastifyReply) {
  const body = (request.body ?? {}) as Record<string, unknown>
  return reply.send(success(await request.server.ctx.regionService.enable(body)))
}
