import type { FastifyReply, FastifyRequest } from 'fastify'
import { success } from '../../shared/http/api-response.js'
import { noRequestSchema, type RequestOf } from '../../shared/http/request-schema.js'
import { accountParamsSchema, accountStoreSchema, accountUpdateSchema } from './account.schema.js'

export async function accountIndex(request: FastifyRequest<RequestOf<typeof noRequestSchema>>, reply: FastifyReply) {
  return reply.send(success(await request.server.ctx.modules.accounts.service.allPublic()))
}

export async function accountShow(request: FastifyRequest<RequestOf<typeof accountParamsSchema>>, reply: FastifyReply) {
  return reply.send(success(await request.server.ctx.modules.accounts.service.findPublic(request.params.id)))
}

export async function accountStore(request: FastifyRequest<RequestOf<typeof accountStoreSchema>>, reply: FastifyReply) {
  return reply.status(201).send(success(await request.server.ctx.modules.accounts.service.create(request.body)))
}

export async function accountUpdate(
  request: FastifyRequest<RequestOf<typeof accountUpdateSchema>>,
  reply: FastifyReply
) {
  return reply.send(success(await request.server.ctx.modules.accounts.service.update(request.params.id, request.body)))
}
