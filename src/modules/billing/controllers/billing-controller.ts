import type { FastifyReply, FastifyRequest } from 'fastify'
import { success } from '../../../lib/http/api-response.js'
import { parseCacheMode } from '../../../lib/cache/aws-cache.js'
import { bodyRecord, queryBool, queryRecord } from '../../../lib/utils/request-parse.js'

export async function billingYearly(request: FastifyRequest, reply: FastifyReply) {
  const body = bodyRecord(request)
  const q = queryRecord(request)
  const mode = parseCacheMode({
    ...('refresh' in q || 'refresh' in body
      ? { refresh: queryBool(q, 'refresh', queryBool(body, 'refresh')) }
      : {}),
    ...('cache_only' in q || 'cache_only' in body
      ? { cache_only: queryBool(q, 'cache_only', queryBool(body, 'cache_only')) }
      : {}),
  })
  return reply.send(success(await request.server.ctx.billingService.yearlySummary(body, mode)))
}
