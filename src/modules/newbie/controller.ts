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

/** Read-only log stream. Execution continues in background even if client disconnects. */
export async function newbieStream(request: FastifyRequest<{ Params: { task: string } }>, reply: FastifyReply) {
  const ac = new AbortController()
  const onClose = () => ac.abort()
  request.raw.on('close', onClose)

  reply.hijack()
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  })

  const write = (message: string) => {
    if (ac.signal.aborted || reply.raw.writableEnded) return
    reply.raw.write(`data: ${String(message).replace(/\n/g, ' ')}\n\n`)
  }

  try {
    await request.server.ctx.newbieTaskService.streamLogs(request.params.task, write, { signal: ac.signal })
  } catch (error) {
    write(`任务失败：${error instanceof Error ? error.message : String(error)}`)
  } finally {
    request.raw.off('close', onClose)
    if (!reply.raw.writableEnded) reply.raw.end()
  }
}
