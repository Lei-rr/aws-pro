import { AppConfigRepository, DEFAULT_APP_CONFIG } from '../modules/auth/auth-config.repository.js'
import { AuthConfig } from '../modules/auth/auth-config.service.js'
import { SessionService } from '../modules/auth/auth.service.js'
import { AccountRepository } from '../modules/accounts/account.repository.js'
import { AccountService } from '../modules/accounts/account.service.js'
import { BillingProvider } from '../modules/billing/billing.client.js'
import { BillingService } from '../modules/billing/billing.service.js'
import { Ec2Provider } from '../modules/ec2/ec2.client.js'
import { Ec2InstanceRepository } from '../modules/ec2/ec2.repository.js'
import { Ec2Service } from '../modules/ec2/ec2.service.js'
import { LightsailBundleGateway } from '../modules/lightsail/lightsail-bundle.client.js'
import { LightsailProvider } from '../modules/lightsail/lightsail.client.js'
import { LightsailInstanceRepository } from '../modules/lightsail/lightsail.repository.js'
import { LightsailService } from '../modules/lightsail/lightsail.service.js'
import { NewbieTaskRepository } from '../modules/newbie/newbie.repository.js'
import { NewbieTaskRunner } from '../modules/newbie/newbie.runner.js'
import { NewbieTaskService } from '../modules/newbie/newbie.service.js'
import { QuotaProvider } from '../modules/quota/quota.client.js'
import { QuotaService } from '../modules/quota/quota.service.js'
import { RegionProvider } from '../modules/regions/region.client.js'
import { RegionService } from '../modules/regions/region.service.js'
import { JsonStore } from '../platform/storage/json-store.js'
import { AwsCatalogService } from '../shared/aws/aws-catalog.js'
import { AwsClientFactory } from '../shared/aws/aws-client.factory.js'

export async function createModules() {
  const clients = new AwsClientFactory()
  const catalog = new AwsCatalogService()
  const accountsRepository = new AccountRepository(new JsonStore('accounts.json', { items: [] }))
  const accounts = new AccountService(accountsRepository)
  const lightsailRepository = new LightsailInstanceRepository(
    new JsonStore('lightsail-instances.json', { items: [] }),
    accounts
  )
  const ec2Repository = new Ec2InstanceRepository(new JsonStore('ec2-instances.json', { items: [] }), accounts)
  const newbie = new NewbieTaskService(
    accounts,
    new NewbieTaskRepository(new JsonStore('newbie-tasks.json', { items: [] })),
    new NewbieTaskRunner(clients)
  )

  const authConfigRepository = new AppConfigRepository(new JsonStore('config.json', DEFAULT_APP_CONFIG))
  await Promise.all([
    authConfigRepository.initialize(),
    accountsRepository.all(),
    lightsailRepository.all(),
    ec2Repository.all(),
  ])

  return {
    auth: {
      session: new SessionService(new AuthConfig(authConfigRepository)),
    },
    accounts: { service: accounts, repository: accountsRepository },
    lightsail: {
      service: new LightsailService(
        accounts,
        new LightsailProvider(clients),
        new LightsailBundleGateway(clients),
        lightsailRepository
      ),
      repository: lightsailRepository,
    },
    ec2: {
      service: new Ec2Service(accounts, new Ec2Provider(clients), ec2Repository),
      repository: ec2Repository,
    },
    regions: { service: new RegionService(accounts, new RegionProvider(clients), catalog) },
    quota: { service: new QuotaService(accounts, new QuotaProvider(clients)) },
    billing: { service: new BillingService(accounts, new BillingProvider(clients)) },
    newbie: { service: newbie },
    system: { catalog },
  }
}

export type AppModules = Awaited<ReturnType<typeof createModules>>
