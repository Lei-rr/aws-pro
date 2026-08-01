import type { FastifyReply, FastifyRequest } from 'fastify'
import { success } from '../../shared/http/api-response.js'
import { parseCacheMode } from '../../platform/cache/aws-cache.js'
import type { RequestOf } from '../../shared/http/request-schema.js'
import { billingYearlySchema } from './billing.schema.js'

export async function billingYearly(
  request: FastifyRequest<RequestOf<typeof billingYearlySchema>>,
  reply: FastifyReply
) {
  const body = request.body
  const mode = parseCacheMode(body)
  return reply.send(success(await request.server.ctx.modules.billing.service.yearlySummary(body, mode)))
}
