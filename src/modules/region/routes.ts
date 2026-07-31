
import type { FastifyInstance } from 'fastify'
import { regionsEnable, regionsIndex } from './controllers/region-controller.js'
import { regionsEnableSchema, regionsIndexSchema } from '../system/aws-query-schemas.js'
export async function routes(app: FastifyInstance) {
  app.get('/regions', { schema: regionsIndexSchema }, regionsIndex)
  app.post('/regions/enable', { schema: regionsEnableSchema }, regionsEnable)
}
