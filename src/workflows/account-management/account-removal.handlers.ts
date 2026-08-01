import type { FastifyReply, FastifyRequest } from 'fastify'
import { noContent } from '../../shared/http/api-response.js'
import type { RequestOf } from '../../shared/http/request-schema.js'
import { accountParamsSchema } from '../../modules/accounts/account.schema.js'

export async function accountDelete(
  request: FastifyRequest<RequestOf<typeof accountParamsSchema>>,
  reply: FastifyReply
) {
  await request.server.ctx.workflows.accounts.removal.delete(request.params.id)
  return reply.status(204).send(noContent())
}
