
import type { FastifyInstance } from 'fastify'
import Fastify from 'fastify'
import type { AppConfig } from './config/app.js'
import { createAppContext } from './app-context.js'
import { securityPlugin } from './plugins/security.js'
import { staticPlugin } from './plugins/static.js'
import { errorHandlerPlugin } from './plugins/error-handler.js'
import { systemModule } from './modules/system/index.js'
import { authModule } from './modules/auth/index.js'
import { authRequired } from './modules/auth/hooks/auth-required.js'
import { accountModule } from './modules/account/index.js'
import { lightsailModule } from './modules/lightsail/index.js'
import { ec2Module } from './modules/ec2/index.js'
import { regionModule } from './modules/region/index.js'
import { quotaModule } from './modules/quota/index.js'
import { billingModule } from './modules/billing/index.js'
import { newbieModule } from './modules/newbie/index.js'
import './types/session.js'

async function protectedModules(app: FastifyInstance) {
  app.addHook('preHandler', authRequired)
  await app.register(accountModule)
  await app.register(lightsailModule)
  await app.register(ec2Module)
  await app.register(regionModule)
  await app.register(quotaModule)
  await app.register(billingModule)
  await app.register(newbieModule)
}

export async function buildApp(config: AppConfig) {
  const DEFAULT_SESSION_SECRET = 'aws-pro-secure-session'
  const app = Fastify({
    logger: config.logLevel ? { level: config.logLevel } : false,
    trustProxy: config.trustProxy,
  })

  if (config.sessionSecret === DEFAULT_SESSION_SECRET) {
    console.warn('[WARN] SESSION_SECRET is using the default value. Please set a strong secret in production.')
  }

  app.decorate('ctx', createAppContext(config))
  await app.register(securityPlugin, { config })
  await app.register(staticPlugin)
  await app.register(systemModule, { prefix: '/api' })
  await app.register(authModule, { prefix: '/api' })
  await app.register(protectedModules, { prefix: '/api' })
  await app.register(errorHandlerPlugin)
  return app
}

declare module 'fastify' {
  interface FastifyInstance {
    ctx: ReturnType<typeof createAppContext>
  }
}
