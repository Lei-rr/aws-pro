import type { FastifyReply, FastifyRequest } from 'fastify'
import { success } from '../../../lib/http/api-response.js'
import { parseCacheMode } from '../../../lib/cache/aws-cache.js'
import { bodyRecord, queryBool, queryRecord, queryString } from '../../../lib/utils/request-parse.js'

export async function regionsIndex(request: FastifyRequest, reply: FastifyReply) {
  const q = queryRecord(request)
  const mode = parseCacheMode({
    ...('refresh' in q ? { refresh: queryBool(q, 'refresh') } : {}),
    ...('cache_only' in q ? { cache_only: queryBool(q, 'cache_only') } : {}),
  })
  return reply.send(success(await request.server.ctx.regionService.list(queryString(q, 'account_id'), mode)))
}

export async function regionsEnable(request: FastifyRequest, reply: FastifyReply) {
  const body = bodyRecord(request)
  return reply.send(success(await request.server.ctx.regionService.enable(body)))
}
