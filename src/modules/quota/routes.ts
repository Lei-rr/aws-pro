
import type { FastifyInstance } from 'fastify'
import { quotaVcpu } from './controllers/quota-controller.js'
import { quotaVcpuSchema } from '../system/aws-query-schemas.js'
export async function routes(app: FastifyInstance) {
  app.post('/quotas/vcpu', { schema: quotaVcpuSchema }, quotaVcpu)
}
