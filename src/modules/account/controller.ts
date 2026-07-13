import type { FastifyReply, FastifyRequest } from 'fastify'
import { success, noContent } from '../../lib/http/api-response.js'

export async function accountIndex(request: FastifyRequest, reply: FastifyReply) {
  return reply.send(success(await request.server.ctx.accountService.allPublic()))
}

export async function accountShow(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  return reply.send(success(await request.server.ctx.accountService.findPublic(request.params.id)))
}

export async function accountStore(request: FastifyRequest<{ Body: any }>, reply: FastifyReply) {
  const body = (request.body ?? {}) as Record<string, unknown>
  return reply.status(201).send(success(await request.server.ctx.accountService.create(body)))
}

export async function accountUpdate(request: FastifyRequest<{ Params: { id: string }; Body: any }>, reply: FastifyReply) {
  const body = (request.body ?? {}) as Record<string, unknown>
  return reply.send(success(await request.server.ctx.accountService.update(request.params.id, body)))
}

export async function accountDelete(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  await request.server.ctx.accountService.delete(request.params.id)
  return reply.status(204).send(noContent())
}
