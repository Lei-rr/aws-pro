import type { FastifyInstance } from 'fastify'
import { authRequired } from '../modules/auth/auth-required.js'
import {
  routes as systemPublicRoutes,
  protectedRoutes as systemProtectedRoutes,
} from '../modules/system/system.routes.js'
import { routes as authRoutes } from '../modules/auth/auth.routes.js'
import { routes as accountRoutes } from '../modules/accounts/account.routes.js'
import { routes as lightsailRoutes } from '../modules/lightsail/lightsail.routes.js'
import { routes as ec2Routes } from '../modules/ec2/ec2.routes.js'
import { routes as regionRoutes } from '../modules/regions/region.routes.js'
import { routes as quotaRoutes } from '../modules/quota/quota.routes.js'
import { routes as billingRoutes } from '../modules/billing/billing.routes.js'
import { routes as newbieRoutes } from '../modules/newbie/newbie.routes.js'
import { routes as accountRemovalRoutes } from '../workflows/account-management/account-removal.routes.js'

/**
 * HTTP route catalog (append-only).
 *
 * Module = business folder under server/src/modules/* with routes.ts
 * Plugin  = ONLY server/src/plugins/* (official Fastify shell)
 *
 * API prefix stays `/api` (frontend baseURL) — not /api/v1.
 *
 * Auth model:
 * - public: health + session
 * - one authenticated envelope for all business APIs (including /config)
 */
export async function registerApiRoutes(app: FastifyInstance): Promise<void> {
  // Public
  await app.register(systemPublicRoutes)
  await app.register(authRoutes)

  // Authenticated envelope — single place for authRequired
  await app.register(async function authenticatedApi(scope) {
    scope.addHook('preHandler', authRequired)
    await scope.register(systemProtectedRoutes)
    await scope.register(accountRoutes)
    await scope.register(accountRemovalRoutes)
    await scope.register(lightsailRoutes)
    await scope.register(ec2Routes)
    await scope.register(regionRoutes)
    await scope.register(quotaRoutes)
    await scope.register(billingRoutes)
    await scope.register(newbieRoutes)
  })
}
