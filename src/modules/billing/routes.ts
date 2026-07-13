
import type { FastifyInstance } from 'fastify'
import { billingYearly } from './controller.js'
export async function routes(app: FastifyInstance) {
  app.post('/billing/yearly', billingYearly)
}
