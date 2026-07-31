
import type { FastifyInstance } from 'fastify'
import { billingYearly } from './controllers/billing-controller.js'
import { billingYearlySchema } from '../system/aws-query-schemas.js'
export async function routes(app: FastifyInstance) {
  app.post('/billing/yearly', { schema: billingYearlySchema }, billingYearly)
}
