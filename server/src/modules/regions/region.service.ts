import { ApiError } from '../../shared/http/api-error.js'
import {
  awsAccountTag,
  awsResourceTag,
  invalidateAwsCache,
  withAwsCache,
  type CacheReadMode,
} from '../../platform/cache/aws-cache.js'
import * as v from '../../shared/aws/aws-validator.js'
import { scalarString } from '../../shared/lib/scalar.js'
import type { AwsAccountLookup } from '../../shared/aws/account-lookup.js'
import { RegionProvider } from './region.client.js'
import type { AwsCatalogService } from '../../shared/aws/aws-catalog.js'

export class RegionService {
  constructor(
    private readonly accounts: AwsAccountLookup,
    private readonly provider: RegionProvider,
    private readonly config: AwsCatalogService
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
    const accountId = v.accountId(scalarString(body.account_id))
    const region = v.region(scalarString(body.region))
    const configured = await this.configuredRegions()
    if (!configured[region]) throw new ApiError('region_not_configured', 'Region is not configured', 422, { region })
    const account = await this.accounts.requireAccount(accountId)
    const result = await this.provider.enable(account, region)
    invalidateAwsCache([awsResourceTag(accountId, 'regions')])
    return result
  }
}
