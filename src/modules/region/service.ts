import { ApiError } from '../../lib/http/api-error.js'
import {
  awsAccountTag,
  awsResourceTag,
  CacheTtl,
  invalidateAwsCache,
  withAwsCache,
  type CacheReadMode,
} from '../../lib/cache/aws-cache.js'
import * as v from '../../lib/utils/aws-validator.js'
import { AccountService } from '../account/service.js'
import { RegionProvider } from '../../lib/aws/providers/region-provider.js'
import { SystemConfigRepository } from '../system/config-repository.js'

export class RegionService {
  constructor(
    private readonly accounts: AccountService,
    private readonly provider: RegionProvider,
    private readonly config: SystemConfigRepository,
  ) {}

  async configuredRegions() {
    return (await this.config.read()).regions
  }

  async list(accountId: string, mode: CacheReadMode = {}) {
    accountId = v.accountId(accountId)
    const account = await this.accounts.requireAccount(accountId)
    const configured = await this.configuredRegions()

    const result = await withAwsCache({
      key: { prefix: 'aws:regions', parts: { account_id: accountId } },
      tags: [awsAccountTag(accountId), awsResourceTag(accountId, 'regions')],
      ttlMs: CacheTtl.awsLookup,
      mode,
      emptyOnMiss: [] as Array<{ account_id: string; region: string; status: string }>,
      loader: () => this.provider.regions(account),
    })

    return {
      items: result.value.filter((r) => configured[r.region]),
      meta: result.meta,
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
    invalidateAwsCache([awsResourceTag(accountId, 'regions')])
    return result
  }
}
