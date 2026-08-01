import type { FastifyInstance } from 'fastify'
import { noRequestSchema } from '../../shared/http/request-schema.js'
import { sessionStore, sessionShow, sessionDelete } from './auth.handlers.js'
import { sessionStoreSchema } from './auth.schema.js'

export async function routes(app: FastifyInstance) {
  app.post('/session', { schema: sessionStoreSchema }, sessionStore)
  app.get('/session', { schema: noRequestSchema }, sessionShow)
  app.delete('/session', { schema: noRequestSchema }, sessionDelete)
}
