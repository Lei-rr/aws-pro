
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

export function createAppContext(config: AppConfig) {
  const appConfigRepository = new AppConfigRepository()
  const authConfig = new AuthConfig(appConfigRepository)
  const sessionService = new SessionService(authConfig)
  const systemConfigRepository = new SystemConfigRepository()
  const accountService = new AccountService()
  const lightsailService = new LightsailService()
  const ec2Service = new Ec2Service()
  const regionService = new RegionService()
  const quotaService = new QuotaService()
  const billingService = new BillingService()
  const newbieTaskService = new NewbieTaskService()

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

export type AppContext = ReturnType<typeof createAppContext>
