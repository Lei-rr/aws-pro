import type { FastifyInstance } from 'fastify'
import { noRequestSchema } from '../../lib/http/request-schema.js'
import { accountDelete, accountIndex, accountShow, accountStore, accountUpdate } from './controllers/account-controller.js'
import { accountParamsSchema, accountStoreSchema, accountUpdateSchema } from './schemas.js'

export async function routes(app: FastifyInstance) {
  app.get('/accounts', { schema: noRequestSchema }, accountIndex)
  app.post('/accounts', { schema: accountStoreSchema }, accountStore)
  app.get('/accounts/:id', { schema: accountParamsSchema }, accountShow)
  app.put('/accounts/:id', { schema: accountUpdateSchema }, accountUpdate)
  app.delete('/accounts/:id', { schema: accountParamsSchema }, accountDelete)
}
