
import type { FastifyReply, FastifyRequest } from 'fastify'
import { success } from '../../lib/http/api-response.js'

export async function newbieStore(request: FastifyRequest, reply: FastifyReply) {
  const body = (request.body ?? {}) as Record<string, unknown>
  return reply.status(201).send(success(await request.server.ctx.newbieTaskService.create(body)))
}

export async function newbieShow(request: FastifyRequest<{ Params: { task: string } }>, reply: FastifyReply) {
  return reply.send(success(await request.server.ctx.newbieTaskService.find(request.params.task)))
}

export async function newbieCancel(request: FastifyRequest<{ Params: { task: string } }>, reply: FastifyReply) {
  return reply.send(success(await request.server.ctx.newbieTaskService.cancel(request.params.task)))
}

export async function newbieStream(request: FastifyRequest<{ Params: { task: string } }>, reply: FastifyReply) {
  reply.hijack()
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  })
  const write = (message: string) => {
    reply.raw.write(`data: ${message.replace(/\n/g, ' ')}\n\n`)
  }
  try {
    await request.server.ctx.newbieTaskService.runStream(request.params.task, write)
  } catch (error) {
    write(`任务失败：${error instanceof Error ? error.message : String(error)}`)
  } finally {
    reply.raw.end()
  }
}
