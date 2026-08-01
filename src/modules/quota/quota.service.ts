import { awsAccountTags, withAwsCache, type CacheReadMode } from '../../platform/cache/aws-cache.js'
import * as v from '../../shared/aws/aws-validator.js'
import { scalarString } from '../../shared/lib/scalar.js'
import type { AwsAccountLookup } from '../../shared/aws/account-lookup.js'
import { QuotaProvider } from './quota.client.js'

export class QuotaService {
  constructor(
    private readonly accounts: AwsAccountLookup,
    private readonly provider: QuotaProvider
  ) {}

  async vcpuQuota(body: Record<string, unknown>, mode: CacheReadMode = {}) {
    v.required(body, ['account_id', 'region'])
    const accountId = v.accountId(scalarString(body.account_id))
    const region = v.region(scalarString(body.region))
    const account = await this.accounts.requireAccount(accountId)

    const result = await withAwsCache({
      key: { prefix: 'aws:quota:vcpu', parts: { account_id: accountId, region } },
      tags: awsAccountTags(accountId, 'quota'),
      mode,
      emptyOnMiss: [] as Array<Record<string, unknown>>,
      loader: () => this.provider.vcpuQuota(account, region),
    })

    return { items: result.value, meta: result.meta }
  }
}
