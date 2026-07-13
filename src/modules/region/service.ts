
import { ApiError } from '../../lib/http/api-error.js'
import { globalCache } from '../../lib/cache/cache-service.js'
import * as v from '../../lib/utils/aws-validator.js'
import { AccountService } from '../account/service.js'
import { RegionProvider } from '../../lib/aws/providers/region-provider.js'
import { SystemConfigRepository } from '../system/config-repository.js'

const TTL = 10 * 60 * 1000

export class RegionService {
  constructor(
    private readonly accounts = new AccountService(),
    private readonly provider = new RegionProvider(),
    private readonly config = new SystemConfigRepository(),
  ) {}

  async configuredRegions() {
    return (await this.config.read()).regions
  }

  async list(accountId: string, refresh = false) {
    accountId = v.accountId(accountId)
    const account = await this.accounts.requireAccount(accountId)
    const configured = await this.configuredRegions()
    const cacheKey = `aws:regions:${accountId}`
    if (!refresh) {
      const cached = globalCache.get<any[]>(cacheKey)
      if (cached) {
        return {
          items: cached.filter((r) => configured[r.region]),
          meta: { cache: true, source: 'cache' },
        }
      }
    }
    const regions = await this.provider.regions(account)
    globalCache.set(cacheKey, regions, TTL, [`aws:${accountId}`, `aws:regions:${accountId}`])
    return {
      items: regions.filter((r) => configured[r.region]),
      meta: { cache: false, source: 'aws' },
    }
  }

  async enable(body: Record<string, unknown>) {
    v.required(body, ['account_id', 'region'])
    const accountId = v.accountId(String(body.account_id))
    const region = v.region(String(body.region))
    const configured = await this.configuredRegions()
    if (!configured[region]) throw new ApiError('region_not_configured', 'Region is not configured', 422, { region })
    const account = await this.accounts.requireAccount(accountId)
    const result = await this.provider.enable(account, region)
    globalCache.invalidateTags([`aws:regions:${accountId}`])
    return result
  }
}
