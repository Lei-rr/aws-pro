
import type { FastifyReply, FastifyRequest } from 'fastify'
import { success } from '../../lib/http/api-response.js'

const q = (r: FastifyRequest) => (r.query ?? {}) as Record<string, any>
const b = (r: FastifyRequest) => (r.body ?? {}) as Record<string, any>

export async function ec2Instances(request: FastifyRequest, reply: FastifyReply) {
  const query = q(request)
  return reply.send(success(await request.server.ctx.ec2Service.listCached(query.account_id, query.region)))
}
export async function ec2Sync(request: FastifyRequest, reply: FastifyReply) {
  const body = b(request)
  return reply.send(success(await request.server.ctx.ec2Service.sync(String(body.account_id ?? ''), String(body.region ?? ''))))
}
export async function ec2Options(request: FastifyRequest, reply: FastifyReply) {
  return reply.send(success(request.server.ctx.ec2Service.options()))
}
export async function ec2Store(request: FastifyRequest, reply: FastifyReply) {
  const body = b(request)
  const result = await request.server.ctx.ec2Service.createInstance(String(body.account_id ?? ''), String(body.region ?? ''), body)
  return reply.status(201).send(success({ message: 'EC2 实例已创建', ...result }))
}
export async function ec2Action(request: FastifyRequest<{ Params: { instance: string } }>, reply: FastifyReply) {
  const body = b(request)
  return reply.send(
    success({
      message: await request.server.ctx.ec2Service.runAction(
        String(body.account_id ?? ''),
        String(body.region ?? ''),
        request.params.instance,
        body,
      ),
    }),
  )
}
export async function ec2Remark(request: FastifyRequest<{ Params: { instance: string } }>, reply: FastifyReply) {
  const body = b(request)
  return reply.send(
    success(
      await request.server.ctx.ec2Service.updateRemark(
        String(body.account_id ?? ''),
        String(body.region ?? ''),
        request.params.instance,
        String(body.remark ?? ''),
      ),
    ),
  )
}
