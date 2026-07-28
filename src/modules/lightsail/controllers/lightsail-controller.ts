import type { FastifyReply, FastifyRequest } from 'fastify'
import { success } from '../../../lib/http/api-response.js'
import { bodyRecord, bodyString, queryRecord, queryString } from '../../../lib/utils/request-parse.js'

export async function lightsailInstances(request: FastifyRequest, reply: FastifyReply) {
  const query = queryRecord(request)
  return reply.send(
    success(await request.server.ctx.lightsailService.listCached(queryString(query, 'account_id'), queryString(query, 'region'))),
  )
}

export async function lightsailSync(request: FastifyRequest, reply: FastifyReply) {
  const body = bodyRecord(request)
  return reply.send(
    success(await request.server.ctx.lightsailService.sync(bodyString(body, 'account_id'), bodyString(body, 'region'))),
  )
}

export async function lightsailCreateOptions(request: FastifyRequest, reply: FastifyReply) {
  const query = queryRecord(request)
  return reply.send(
    success(
      await request.server.ctx.lightsailService.createOptions(queryString(query, 'account_id'), queryString(query, 'region')),
    ),
  )
}

export async function lightsailStore(request: FastifyRequest, reply: FastifyReply) {
  const body = bodyRecord(request)
  const result = await request.server.ctx.lightsailService.createInstance(
    bodyString(body, 'account_id'),
    bodyString(body, 'region'),
    body,
  )
  return reply.status(201).send(success({ message: '实例已创建', ...result }))
}

export async function lightsailRemark(request: FastifyRequest<{ Params: { instance: string } }>, reply: FastifyReply) {
  const body = bodyRecord(request)
  return reply.send(
    success(
      await request.server.ctx.lightsailService.updateRemark(
        bodyString(body, 'account_id'),
        bodyString(body, 'region'),
        request.params.instance,
        bodyString(body, 'remark'),
      ),
    ),
  )
}

export async function lightsailAction(request: FastifyRequest<{ Params: { instance: string } }>, reply: FastifyReply) {
  const body = bodyRecord(request)
  return reply.send(
    success({
      message: await request.server.ctx.lightsailService.runAction(
        bodyString(body, 'account_id'),
        bodyString(body, 'region'),
        request.params.instance,
        body,
      ),
    }),
  )
}
