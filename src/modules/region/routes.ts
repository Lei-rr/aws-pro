
import type { FastifyInstance } from 'fastify'
import { regionsEnable, regionsIndex } from './controller.js'
export async function routes(app: FastifyInstance) {
  app.get('/regions', regionsIndex)
  app.post('/regions/enable', regionsEnable)
}
