
import type { FastifyInstance } from 'fastify'
import { quotaVcpu } from './controllers/quota-controller.js'
export async function routes(app: FastifyInstance) {
  app.post('/quotas/vcpu', quotaVcpu)
}
