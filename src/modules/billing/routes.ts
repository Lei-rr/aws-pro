
import type { FastifyInstance } from 'fastify'
import { billingYearly } from './controllers/billing-controller.js'
export async function routes(app: FastifyInstance) {
  app.post('/billing/yearly', billingYearly)
}
