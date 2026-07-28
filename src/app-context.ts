/**
 * Composition root — WIRING ONLY.
 *
 * Rules:
 * - new services / stores / providers here; no business rules
 * - controllers use request.server.ctx.* only
 * - Fastify plugins live in src/plugins/* only
 */
import type { AppConfig } from './config/app.js'
import { JsonStore } from './lib/storage/json-store.js'
import { AppConfigRepository, DEFAULT_APP_CONFIG } from './lib/auth/app-config-repository.js'
import { AuthConfig } from './lib/auth/auth-config.js'
import { SessionService } from './modules/auth/service.js'
import { AccountRepository } from './modules/account/repository.js'
import { AccountService } from './modules/account/service.js'
import { LightsailInstanceRepository } from './modules/lightsail/repository.js'
import { LightsailService } from './modules/lightsail/service.js'
import { Ec2InstanceRepository } from './modules/ec2/repository.js'
import { Ec2Service } from './modules/ec2/service.js'
import { RegionService } from './modules/region/service.js'
import { QuotaService } from './modules/quota/service.js'
import { BillingService } from './modules/billing/service.js'
import { NewbieTaskRepository } from './modules/newbie/repository.js'
import { NewbieTaskRunner } from './modules/newbie/runner.js'
import { NewbieTaskService } from './modules/newbie/service.js'
import { SystemConfigRepository } from './modules/system/config-repository.js'
import { AwsClientFactory } from './lib/aws/client-factory.js'
import { LightsailProvider } from './lib/aws/providers/lightsail-provider.js'
import { LightsailBundleGateway } from './lib/aws/providers/lightsail-bundle-gateway.js'
import { Ec2Provider } from './lib/aws/providers/ec2-provider.js'
import { RegionProvider } from './lib/aws/providers/region-provider.js'
import { QuotaProvider } from './lib/aws/providers/quota-provider.js'
import { BillingProvider } from './lib/aws/providers/billing-provider.js'

export async function createAppContext(config: AppConfig) {
  const clients = new AwsClientFactory()

  const appConfigRepository = new AppConfigRepository(
    new JsonStore('config.json', DEFAULT_APP_CONFIG),
  )
  const authConfig = new AuthConfig(appConfigRepository)
  const sessionService = new SessionService(authConfig)
  const systemConfigRepository = new SystemConfigRepository()

  const accountRepository = new AccountRepository(new JsonStore('accounts.json', { items: [] }))
  const lightsailRepository = new LightsailInstanceRepository(
    new JsonStore('lightsail-instances.json', { items: [] }),
  )
  const ec2Repository = new Ec2InstanceRepository(new JsonStore('ec2-instances.json', { items: [] }))
  const newbieRepository = new NewbieTaskRepository(new JsonStore('newbie-tasks.json', { items: [] }))

  const accountService = new AccountService(accountRepository, lightsailRepository, ec2Repository)
  const lightsailService = new LightsailService(
    accountService,
    new LightsailProvider(clients),
    new LightsailBundleGateway(clients),
    lightsailRepository,
  )
  const ec2Service = new Ec2Service(accountService, new Ec2Provider(clients), ec2Repository)
  const regionService = new RegionService(
    accountService,
    new RegionProvider(clients),
    systemConfigRepository,
  )
  const quotaService = new QuotaService(accountService, new QuotaProvider(clients))
  const billingService = new BillingService(accountService, new BillingProvider(clients))
  const newbieTaskService = new NewbieTaskService(
    accountService,
    newbieRepository,
    new NewbieTaskRunner(clients),
  )

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
