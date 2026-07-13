
import type { FastifyReply, FastifyRequest } from 'fastify'
import { success } from '../../lib/http/api-response.js'
import { parseBool } from '../../lib/utils/parse-bool.js'

export async function regionsIndex(request: FastifyRequest, reply: FastifyReply) {
  const q = (request.query ?? {}) as Record<string, any>
  return reply.send(success(await request.server.ctx.regionService.list(String(q.account_id ?? ''), parseBool(q.refresh))))
}

export async function regionsEnable(request: FastifyRequest, reply: FastifyReply) {
  const body = (request.body ?? {}) as Record<string, unknown>
  return reply.send(success(await request.server.ctx.regionService.enable(body)))
}
