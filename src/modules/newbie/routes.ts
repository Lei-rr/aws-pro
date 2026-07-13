
import type { FastifyInstance } from 'fastify'
import { newbieCancel, newbieShow, newbieStore, newbieStream } from './controller.js'

export async function routes(app: FastifyInstance) {
  app.post('/newbie/tasks', newbieStore)
  app.get('/newbie/tasks/:task', newbieShow)
  app.post('/newbie/tasks/:task/cancel', newbieCancel)
  app.get('/newbie/tasks/:task/stream', newbieStream)
}
