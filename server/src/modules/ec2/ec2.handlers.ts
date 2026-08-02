import type { FastifyReply, FastifyRequest } from 'fastify'
import { success } from '../../shared/http/api-response.js'
import { noRequestSchema, type RequestOf } from '../../shared/http/request-schema.js'
import { ec2ActionSchema, ec2InstancesSchema, ec2RemarkSchema, ec2StoreSchema, ec2SyncSchema } from './ec2.schema.js'

export async function ec2Instances(request: FastifyRequest<RequestOf<typeof ec2InstancesSchema>>, reply: FastifyReply) {
  const { account_id = '', region = '', refresh } = request.query
  return reply.send(
    success(
      await request.server.ctx.modules.ec2.service.listCached(account_id, region, refresh === '1' || refresh === 'true')
    )
  )
}

export async function ec2Sync(request: FastifyRequest<RequestOf<typeof ec2SyncSchema>>, reply: FastifyReply) {
  return reply.send(
    success(await request.server.ctx.modules.ec2.service.sync(request.body.account_id, request.body.region))
  )
}

export async function ec2Options(request: FastifyRequest<RequestOf<typeof noRequestSchema>>, reply: FastifyReply) {
  return reply.send(success(request.server.ctx.modules.ec2.service.options()))
}

export async function ec2Store(request: FastifyRequest<RequestOf<typeof ec2StoreSchema>>, reply: FastifyReply) {
  const result = await request.server.ctx.modules.ec2.service.createInstance(
    request.body.account_id,
    request.body.region,
    request.body
  )
  return reply.status(201).send(success({ message: 'EC2 实例已创建', ...result }))
}

export async function ec2Action(request: FastifyRequest<RequestOf<typeof ec2ActionSchema>>, reply: FastifyReply) {
  return reply.send(
    success({
      message: await request.server.ctx.modules.ec2.service.runAction(
        request.body.account_id,
        request.body.region,
        request.params.instance,
        request.body
      ),
    })
  )
}

export async function ec2Remark(request: FastifyRequest<RequestOf<typeof ec2RemarkSchema>>, reply: FastifyReply) {
  return reply.send(
    success(
      await request.server.ctx.modules.ec2.service.updateRemark(
        request.body.account_id,
        request.body.region,
        request.params.instance,
        request.body.remark
      )
    )
  )
}
