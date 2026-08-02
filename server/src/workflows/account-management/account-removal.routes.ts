import type { FastifyInstance } from 'fastify'
import { accountParamsSchema } from '../../modules/accounts/account.schema.js'
import { accountDelete } from './account-removal.handlers.js'

export async function routes(app: FastifyInstance) {
  app.delete('/accounts/:id', { schema: accountParamsSchema }, accountDelete)
}
