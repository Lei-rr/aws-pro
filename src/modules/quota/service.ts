import { awsAccountTags, CacheTtl, withAwsCache, type CacheReadMode } from '../../lib/cache/aws-cache.js'
import * as v from '../../lib/utils/aws-validator.js'
import { scalarString } from '../../lib/utils/scalar.js'
import { AccountService } from '../account/service.js'
import { QuotaProvider } from '../../lib/aws/providers/quota-provider.js'

export class QuotaService {
  constructor(
    private readonly accounts: AccountService,
    private readonly provider: QuotaProvider,
  ) {}

  async vcpuQuota(body: Record<string, unknown>, mode: CacheReadMode = {}) {
    v.required(body, ['account_id', 'region'])
    const accountId = v.accountId(scalarString(body.account_id))
    const region = v.region(scalarString(body.region))
    const account = await this.accounts.requireAccount(accountId)

    const result = await withAwsCache({
      key: { prefix: 'aws:quota:vcpu', parts: { account_id: accountId, region } },
      tags: awsAccountTags(accountId, 'quota'),
      ttlMs: CacheTtl.awsLookup,
      mode,
      emptyOnMiss: [] as Array<Record<string, unknown>>,
      loader: () => this.provider.vcpuQuota(account, region),
    })

    return { items: result.value, meta: result.meta }
  }
}
