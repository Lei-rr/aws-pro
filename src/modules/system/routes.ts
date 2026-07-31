import type { FastifyInstance } from 'fastify'
import { noRequestSchema } from '../../lib/http/request-schema.js'
import { configIndex, healthShow } from './controllers/system-controller.js'

/** Public system routes (no auth). */
export async function routes(app: FastifyInstance) {
  app.get('/health', { schema: noRequestSchema }, healthShow)
}

/** Authenticated system routes — mounted inside compose auth envelope. */
export async function protectedRoutes(app: FastifyInstance) {
  app.get('/config', { schema: noRequestSchema }, configIndex)
}
