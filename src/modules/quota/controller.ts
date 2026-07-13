
import type { FastifyReply, FastifyRequest } from 'fastify'
import { success } from '../../lib/http/api-response.js'
import { parseBool } from '../../lib/utils/parse-bool.js'

export async function quotaVcpu(request: FastifyRequest, reply: FastifyReply) {
  const body = (request.body ?? {}) as Record<string, unknown>
  const refresh = parseBool((request.query as any)?.refresh ?? body.refresh)
  return reply.send(success(await request.server.ctx.quotaService.vcpuQuota(body, refresh)))
}
