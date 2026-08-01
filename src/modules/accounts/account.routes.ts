import type { FastifyInstance } from 'fastify'
import { noRequestSchema } from '../../shared/http/request-schema.js'
import { accountIndex, accountShow, accountStore, accountUpdate } from './account.handlers.js'
import { accountParamsSchema, accountStoreSchema, accountUpdateSchema } from './account.schema.js'

export async function routes(app: FastifyInstance) {
  app.get('/accounts', { schema: noRequestSchema }, accountIndex)
  app.post('/accounts', { schema: accountStoreSchema }, accountStore)
  app.get('/accounts/:id', { schema: accountParamsSchema }, accountShow)
  app.put('/accounts/:id', { schema: accountUpdateSchema }, accountUpdate)
}
