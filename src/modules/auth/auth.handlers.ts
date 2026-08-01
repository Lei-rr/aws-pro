import type { FastifyReply, FastifyRequest } from 'fastify'
import { noContent, success } from '../../shared/http/api-response.js'
import { noRequestSchema, type RequestOf } from '../../shared/http/request-schema.js'
import { sessionStoreSchema } from './auth.schema.js'

export async function sessionStore(request: FastifyRequest<RequestOf<typeof sessionStoreSchema>>, reply: FastifyReply) {
  const { username, password } = request.body
  const session = await request.server.ctx.modules.auth.session.login(request, username, password)
  return reply.send(success(session))
}

export async function sessionShow(request: FastifyRequest<RequestOf<typeof noRequestSchema>>, reply: FastifyReply) {
  return reply.send(success(request.server.ctx.modules.auth.session.currentSession(request)))
}

export async function sessionDelete(request: FastifyRequest<RequestOf<typeof noRequestSchema>>, reply: FastifyReply) {
  request.server.ctx.modules.auth.session.logout(request)
  return reply.status(204).send(noContent())
}
