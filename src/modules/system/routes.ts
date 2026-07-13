import type { FastifyInstance } from 'fastify'
import { configIndex, healthShow } from './controller.js'
import { authRequired } from '../auth/hooks/auth-required.js'

export async function routes(app: FastifyInstance) {
  app.get('/health', healthShow)
  app.get('/config', { preHandler: authRequired }, configIndex)
}
