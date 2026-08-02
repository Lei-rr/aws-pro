import type { FastifyInstance } from 'fastify'
import { noRequestSchema } from '../../shared/http/request-schema.js'
import { newbieActive, newbieCancel, newbieRecent, newbieShow, newbieStore, newbieStream } from './newbie.handlers.js'
import { newbieStoreSchema, newbieStreamSchema, newbieTaskParamsSchema } from './newbie.schema.js'

export async function routes(app: FastifyInstance) {
  app.post('/newbie/tasks', { schema: newbieStoreSchema }, newbieStore)
  app.get('/newbie/tasks/active', { schema: noRequestSchema }, newbieActive)
  app.get('/newbie/tasks/recent', { schema: noRequestSchema }, newbieRecent)
  app.get('/newbie/tasks/:task', { schema: newbieTaskParamsSchema }, newbieShow)
  app.post('/newbie/tasks/:task/cancel', { schema: newbieTaskParamsSchema }, newbieCancel)
  app.get('/newbie/tasks/:task/stream', { schema: newbieStreamSchema }, newbieStream)
}
