import type { FastifyReply, FastifyRequest } from 'fastify'
import { success } from '../../../lib/http/api-response.js'
import { bodyRecord, bodyString, queryRecord, queryString } from '../../../lib/utils/request-parse.js'

export async function ec2Instances(request: FastifyRequest, reply: FastifyReply) {
  const query = queryRecord(request)
  return reply.send(
    success(await request.server.ctx.ec2Service.listCached(queryString(query, 'account_id'), queryString(query, 'region'))),
  )
}

export async function ec2Sync(request: FastifyRequest, reply: FastifyReply) {
  const body = bodyRecord(request)
  return reply.send(success(await request.server.ctx.ec2Service.sync(bodyString(body, 'account_id'), bodyString(body, 'region'))))
}

export async function ec2Options(request: FastifyRequest, reply: FastifyReply) {
  return reply.send(success(request.server.ctx.ec2Service.options()))
}

export async function ec2Store(request: FastifyRequest, reply: FastifyReply) {
  const body = bodyRecord(request)
  const result = await request.server.ctx.ec2Service.createInstance(bodyString(body, 'account_id'), bodyString(body, 'region'), body)
  return reply.status(201).send(success({ message: 'EC2 实例已创建', ...result }))
}

export async function ec2Action(request: FastifyRequest<{ Params: { instance: string } }>, reply: FastifyReply) {
  const body = bodyRecord(request)
  return reply.send(
    success({
      message: await request.server.ctx.ec2Service.runAction(
        bodyString(body, 'account_id'),
        bodyString(body, 'region'),
        request.params.instance,
        body,
      ),
    }),
  )
}

export async function ec2Remark(request: FastifyRequest<{ Params: { instance: string } }>, reply: FastifyReply) {
  const body = bodyRecord(request)
  return reply.send(
    success(
      await request.server.ctx.ec2Service.updateRemark(
        bodyString(body, 'account_id'),
        bodyString(body, 'region'),
        request.params.instance,
        bodyString(body, 'remark'),
      ),
    ),
  )
}
