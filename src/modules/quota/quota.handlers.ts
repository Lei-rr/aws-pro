import type { FastifyReply, FastifyRequest } from 'fastify'
import { success } from '../../shared/http/api-response.js'
import { parseCacheMode } from '../../platform/cache/aws-cache.js'
import type { RequestOf } from '../../shared/http/request-schema.js'
import { quotaVcpuSchema } from './quota.schema.js'

export async function quotaVcpu(request: FastifyRequest<RequestOf<typeof quotaVcpuSchema>>, reply: FastifyReply) {
  const body = request.body
  const mode = parseCacheMode(body)
  return reply.send(success(await request.server.ctx.modules.quota.service.vcpuQuota(body, mode)))
}
