import type { FastifyReply, FastifyRequest } from 'fastify'
import { success } from '../../lib/http/api-response.js'
import { parseCacheMode } from '../../lib/cache/aws-cache.js'
import { parseBool } from '../../lib/utils/parse-bool.js'

export async function billingYearly(request: FastifyRequest, reply: FastifyReply) {
  const body = (request.body ?? {}) as Record<string, unknown>
  const q = (request.query ?? {}) as Record<string, unknown>
  const mode = parseCacheMode({
    refresh: parseBool(q.refresh ?? body.refresh),
    cache_only: parseBool(q.cache_only ?? body.cache_only),
  })
  return reply.send(success(await request.server.ctx.billingService.yearlySummary(body, mode)))
}
