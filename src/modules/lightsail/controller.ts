
import type { FastifyReply, FastifyRequest } from 'fastify'
import { success } from '../../lib/http/api-response.js'

function q(request: FastifyRequest) {
  return (request.query ?? {}) as Record<string, any>
}
function b(request: FastifyRequest) {
  return (request.body ?? {}) as Record<string, any>
}

export async function lightsailInstances(request: FastifyRequest, reply: FastifyReply) {
  const query = q(request)
  return reply.send(success(await request.server.ctx.lightsailService.listCached(query.account_id, query.region)))
}

export async function lightsailSync(request: FastifyRequest, reply: FastifyReply) {
  const body = b(request)
  return reply.send(success(await request.server.ctx.lightsailService.sync(String(body.account_id ?? ''), String(body.region ?? ''))))
}

export async function lightsailCreateOptions(request: FastifyRequest, reply: FastifyReply) {
  const query = q(request)
  return reply.send(
    success(await request.server.ctx.lightsailService.createOptions(String(query.account_id ?? ''), String(query.region ?? ''))),
  )
}

export async function lightsailStore(request: FastifyRequest, reply: FastifyReply) {
  const body = b(request)
  const result = await request.server.ctx.lightsailService.createInstance(
    String(body.account_id ?? ''),
    String(body.region ?? ''),
    body,
  )
  return reply.status(201).send(success({ message: '实例已创建', ...result }))
}

export async function lightsailRemark(request: FastifyRequest<{ Params: { instance: string } }>, reply: FastifyReply) {
  const body = b(request)
  return reply.send(
    success(
      await request.server.ctx.lightsailService.updateRemark(
        String(body.account_id ?? ''),
        String(body.region ?? ''),
        request.params.instance,
        String(body.remark ?? ''),
      ),
    ),
  )
}

export async function lightsailAction(request: FastifyRequest<{ Params: { instance: string } }>, reply: FastifyReply) {
  const body = b(request)
  return reply.send(
    success({
      message: await request.server.ctx.lightsailService.runAction(
        String(body.account_id ?? ''),
        String(body.region ?? ''),
        request.params.instance,
        body,
      ),
    }),
  )
}
