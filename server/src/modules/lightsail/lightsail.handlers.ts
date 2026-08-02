import type { FastifyReply, FastifyRequest } from 'fastify'
import { success } from '../../shared/http/api-response.js'
import type { RequestOf } from '../../shared/http/request-schema.js'
import {
  lightsailActionSchema,
  lightsailCreateOptionsSchema,
  lightsailInstancesSchema,
  lightsailRemarkSchema,
  lightsailStoreSchema,
  lightsailSyncSchema,
} from './lightsail.schema.js'

export async function lightsailInstances(
  request: FastifyRequest<RequestOf<typeof lightsailInstancesSchema>>,
  reply: FastifyReply
) {
  const { account_id = '', region = '', refresh } = request.query
  return reply.send(
    success(
      await request.server.ctx.modules.lightsail.service.listCached(
        account_id,
        region,
        refresh === '1' || refresh === 'true'
      )
    )
  )
}

export async function lightsailSync(
  request: FastifyRequest<RequestOf<typeof lightsailSyncSchema>>,
  reply: FastifyReply
) {
  return reply.send(
    success(await request.server.ctx.modules.lightsail.service.sync(request.body.account_id, request.body.region))
  )
}

export async function lightsailCreateOptions(
  request: FastifyRequest<RequestOf<typeof lightsailCreateOptionsSchema>>,
  reply: FastifyReply
) {
  return reply.send(
    success(
      await request.server.ctx.modules.lightsail.service.createOptions(request.query.account_id, request.query.region)
    )
  )
}

export async function lightsailStore(
  request: FastifyRequest<RequestOf<typeof lightsailStoreSchema>>,
  reply: FastifyReply
) {
  const result = await request.server.ctx.modules.lightsail.service.createInstance(
    request.body.account_id,
    request.body.region,
    request.body
  )
  return reply.status(201).send(success({ message: '实例已创建', ...result }))
}

export async function lightsailRemark(
  request: FastifyRequest<RequestOf<typeof lightsailRemarkSchema>>,
  reply: FastifyReply
) {
  return reply.send(
    success(
      await request.server.ctx.modules.lightsail.service.updateRemark(
        request.body.account_id,
        request.body.region,
        request.params.instance,
        request.body.remark
      )
    )
  )
}

export async function lightsailAction(
  request: FastifyRequest<RequestOf<typeof lightsailActionSchema>>,
  reply: FastifyReply
) {
  return reply.send(
    success({
      message: await request.server.ctx.modules.lightsail.service.runAction(
        request.body.account_id,
        request.body.region,
        request.params.instance,
        request.body
      ),
    })
  )
}
