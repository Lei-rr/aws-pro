import type { FastifyReply, FastifyRequest } from 'fastify'
import { success } from '../../shared/http/api-response.js'
import { parseCacheMode } from '../../platform/cache/aws-cache.js'
import type { RequestOf } from '../../shared/http/request-schema.js'
import { regionsEnableSchema, regionsIndexSchema } from './region.schema.js'

export async function regionsIndex(request: FastifyRequest<RequestOf<typeof regionsIndexSchema>>, reply: FastifyReply) {
  const query = request.query
  return reply.send(
    success(await request.server.ctx.modules.regions.service.list(query.account_id, parseCacheMode(query)))
  )
}

export async function regionsEnable(
  request: FastifyRequest<RequestOf<typeof regionsEnableSchema>>,
  reply: FastifyReply
) {
  return reply.send(success(await request.server.ctx.modules.regions.service.enable(request.body)))
}
