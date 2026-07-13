
import type { FastifyInstance } from 'fastify'
import { routes } from './routes.js'
export async function ec2Module(app: FastifyInstance) {
  await app.register(routes)
}
