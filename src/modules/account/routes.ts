import type { FastifyInstance } from 'fastify'
import { accountDelete, accountIndex, accountShow, accountStore, accountUpdate } from './controller.js'

export async function routes(app: FastifyInstance) {
  app.get('/accounts', accountIndex)
  app.post('/accounts', accountStore)
  app.get('/accounts/:id', accountShow)
  app.put('/accounts/:id', accountUpdate)
  app.delete('/accounts/:id', accountDelete)
}
