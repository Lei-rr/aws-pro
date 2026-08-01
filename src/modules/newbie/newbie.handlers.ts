import type { FastifyReply, FastifyRequest } from 'fastify'
import { success } from '../../shared/http/api-response.js'
import { noRequestSchema, type RequestOf } from '../../shared/http/request-schema.js'
import { presentNewbieTask } from './newbie.presenter.js'
import { newbieStoreSchema, newbieStreamSchema, newbieTaskParamsSchema } from './newbie.schema.js'

export async function newbieStore(request: FastifyRequest<RequestOf<typeof newbieStoreSchema>>, reply: FastifyReply) {
  return reply
    .status(201)
    .send(success(presentNewbieTask(await request.server.ctx.modules.newbie.service.create(request.body))))
}

export async function newbieActive(request: FastifyRequest<RequestOf<typeof noRequestSchema>>, reply: FastifyReply) {
  return reply.send(success(presentNewbieTask(await request.server.ctx.modules.newbie.service.active())))
}

export async function newbieRecent(request: FastifyRequest<RequestOf<typeof noRequestSchema>>, reply: FastifyReply) {
  return reply.send(success(presentNewbieTask(await request.server.ctx.modules.newbie.service.recent())))
}

export async function newbieShow(
  request: FastifyRequest<RequestOf<typeof newbieTaskParamsSchema>>,
  reply: FastifyReply
) {
  return reply.send(
    success(presentNewbieTask(await request.server.ctx.modules.newbie.service.find(request.params.task)))
  )
}

export async function newbieCancel(
  request: FastifyRequest<RequestOf<typeof newbieTaskParamsSchema>>,
  reply: FastifyReply
) {
  return reply.send(
    success(presentNewbieTask(await request.server.ctx.modules.newbie.service.cancel(request.params.task)))
  )
}

/** Read-only log stream. Execution continues in background even if client disconnects. */
export async function newbieStream(request: FastifyRequest<RequestOf<typeof newbieStreamSchema>>, reply: FastifyReply) {
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

  const afterSeq = Number(request.query.after_seq ?? 0)
  const write = (message: string, seq: number) => {
    if (ac.signal.aborted || reply.raw.writableEnded) return
    reply.raw.write(`id: ${seq}\ndata: ${String(message).replace(/\n/g, ' ')}\n\n`)
  }

  try {
    await request.server.ctx.modules.newbie.service.streamLogs(request.params.task, write, {
      signal: ac.signal,
      afterSeq,
    })
  } catch (error) {
    write(`任务失败：${error instanceof Error ? error.message : String(error)}`, afterSeq + 1)
  } finally {
    request.raw.off('close', onClose)
    if (!reply.raw.writableEnded) reply.raw.end()
  }
}
