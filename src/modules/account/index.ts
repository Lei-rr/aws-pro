import type { FastifyInstance } from 'fastify'
import { routes } from './routes.js'

export async function accountModule(app: FastifyInstance) {
  await app.register(routes)
}
