import { awsAccountTags, CacheTtl, withAwsCache, type CacheReadMode } from '../../lib/cache/aws-cache.js'
import * as v from '../../lib/utils/aws-validator.js'
import { AccountService } from '../account/service.js'
import { BillingProvider } from '../../lib/aws/providers/billing-provider.js'

type BillingCacheValue = {
  items: any[]
  total_cost: number
  total_credit: number
  unit: string
}

export class BillingService {
  constructor(
    private readonly accounts: AccountService,
    private readonly billing: BillingProvider,
  ) {}

  async yearlySummary(body: Record<string, unknown>, mode: CacheReadMode = {}) {
    v.required(body, ['account_id'])
    const accountId = v.accountId(String(body.account_id))
    const account = await this.accounts.requireAccount(accountId)

    const result = await withAwsCache<BillingCacheValue>({
      key: { prefix: 'aws:billing:yearly', parts: { account_id: accountId } },
      tags: awsAccountTags(accountId, 'billing'),
      ttlMs: CacheTtl.awsLookup,
      mode,
      emptyOnMiss: { items: [], total_cost: 0, total_credit: 0, unit: 'USD' },
      loader: async () => {
        const items = await this.billing.yearlyCostAndCredits(account)
        let totalCost = 0
        let totalCredit = 0
        for (const item of items) {
          totalCost += Number(item.cost || 0)
          totalCredit += Number(item.credit || 0)
        }
        return { items, total_cost: totalCost, total_credit: totalCredit, unit: 'USD' }
      },
    })

    return { ...result.value, meta: result.meta }
  }
}
