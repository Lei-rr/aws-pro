import type { FastifyReply, FastifyRequest } from 'fastify'
import { success } from '../../../lib/http/api-response.js'
import { bodyRecord, queryInt, queryRecord } from '../../../lib/utils/request-parse.js'

export async function newbieStore(request: FastifyRequest, reply: FastifyReply) {
  const body = bodyRecord(request)
  return reply.status(201).send(success(await request.server.ctx.newbieTaskService.create(body)))
}

export async function newbieActive(request: FastifyRequest, reply: FastifyReply) {
  return reply.send(success(await request.server.ctx.newbieTaskService.active()))
}

export async function newbieRecent(request: FastifyRequest, reply: FastifyReply) {
  return reply.send(success(await request.server.ctx.newbieTaskService.recent()))
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

  const afterSeq = queryInt(queryRecord(request), 'after_seq', 0, 0, Number.MAX_SAFE_INTEGER)
  const write = (message: string, seq: number) => {
    if (ac.signal.aborted || reply.raw.writableEnded) return
    reply.raw.write(`id: ${seq}\ndata: ${String(message).replace(/\n/g, ' ')}\n\n`)
  }

  try {
    await request.server.ctx.newbieTaskService.streamLogs(request.params.task, write, { signal: ac.signal, afterSeq })
  } catch (error) {
    write(`任务失败：${error instanceof Error ? error.message : String(error)}`, afterSeq + 1)
  } finally {
    request.raw.off('close', onClose)
    if (!reply.raw.writableEnded) reply.raw.end()
  }
}
