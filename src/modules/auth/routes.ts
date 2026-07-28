import type { FastifyInstance } from 'fastify'
import { sessionDelete, sessionShow, sessionStore } from './controllers/session-controller.js'

export async function routes(app: FastifyInstance) {
  app.post('/session', sessionStore)
  app.get('/session', sessionShow)
  app.delete('/session', sessionDelete)
}
