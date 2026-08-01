import type { FastifyInstance } from 'fastify'
import { quotaVcpu } from './quota.handlers.js'
import { quotaVcpuSchema } from './quota.schema.js'
export async function routes(app: FastifyInstance) {
  app.post('/quotas/vcpu', { schema: quotaVcpuSchema }, quotaVcpu)
}
