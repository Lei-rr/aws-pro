/**
 * Composition root — WIRING ONLY.
 *
 * Rules:
 * - new services here; no business rules
 * - controllers use request.server.ctx.* only
 * - Fastify plugins live in src/plugins/* only
 */
import type { AppConfig } from './config/app.js'
import { AppConfigRepository } from './lib/auth/app-config-repository.js'
import { AuthConfig } from './lib/auth/auth-config.js'
import { SessionService } from './modules/auth/service.js'
import { AccountService } from './modules/account/service.js'
import { LightsailService } from './modules/lightsail/service.js'
import { Ec2Service } from './modules/ec2/service.js'
import { RegionService } from './modules/region/service.js'
import { QuotaService } from './modules/quota/service.js'
import { BillingService } from './modules/billing/service.js'
import { NewbieTaskService } from './modules/newbie/service.js'
import { SystemConfigRepository } from './modules/system/config-repository.js'

export async function createAppContext(config: AppConfig) {
  const appConfigRepository = new AppConfigRepository()
  const authConfig = new AuthConfig(appConfigRepository)
  const sessionService = new SessionService(authConfig)
  const systemConfigRepository = new SystemConfigRepository()

  // Single instances so repositories / background jobs share memory + file views.
  const accountService = new AccountService()
  const lightsailService = new LightsailService(accountService)
  const ec2Service = new Ec2Service(accountService)
  const regionService = new RegionService(accountService)
  const quotaService = new QuotaService(accountService)
  const billingService = new BillingService(accountService)
  const newbieTaskService = new NewbieTaskService(accountService)

  // Resume unfinished newbie tasks after process restart.
  await newbieTaskService.resumeActiveJobs()

  return {
    config,
    sessionService,
    systemConfigRepository,
    accountService,
    lightsailService,
    ec2Service,
    regionService,
    quotaService,
    billingService,
    newbieTaskService,
  }
}

export type AppContext = Awaited<ReturnType<typeof createAppContext>>

declare module 'fastify' {
  interface FastifyInstance {
    ctx: AppContext
  }
}
