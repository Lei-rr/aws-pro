import type { FastifyInstance } from 'fastify'
import { billingYearly } from './billing.handlers.js'
import { billingYearlySchema } from './billing.schema.js'
export async function routes(app: FastifyInstance) {
  app.post('/billing/yearly', { schema: billingYearlySchema }, billingYearly)
}
