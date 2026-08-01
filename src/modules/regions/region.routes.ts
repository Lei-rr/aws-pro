import type { FastifyInstance } from 'fastify'
import { regionsEnable, regionsIndex } from './region.handlers.js'
import { regionsEnableSchema, regionsIndexSchema } from './region.schema.js'
export async function routes(app: FastifyInstance) {
  app.get('/regions', { schema: regionsIndexSchema }, regionsIndex)
  app.post('/regions/enable', { schema: regionsEnableSchema }, regionsEnable)
}
