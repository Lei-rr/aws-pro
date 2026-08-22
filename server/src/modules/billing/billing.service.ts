import { awsAccountTags, withAwsCache, type CacheReadMode } from '../../platform/cache/aws-cache.js'
import * as v from '../../shared/aws/aws-validator.js'
import { scalarString } from '../../shared/lib/scalar.js'
import type { AwsAccountLookup } from '../../shared/aws/account-lookup.js'
import { BillingProvider } from './billing.client.js'

type YearlyBillingItem = {
  account_id: string
  month: string
  cost: number
  credit: number
  unit: string
}

type BillingCacheValue = {
  items: YearlyBillingItem[]
  total_cost: number
  total_credit: number
  unit: string
}

export class BillingService {
  constructor(
    private readonly accounts: AwsAccountLookup,
    private readonly billing: BillingProvider
  ) {}

  async yearlySummary(body: Record<string, unknown>, mode: CacheReadMode = {}) {
    v.required(body, ['account_id'])
    const accountId = v.accountId(scalarString(body.account_id))
    const account = await this.accounts.requireAccount(accountId)

    const result = await withAwsCache<BillingCacheValue>({
      key: { prefix: 'aws:billing:yearly', parts: { account_id: accountId } },
      tags: awsAccountTags(accountId, 'billing'),
      mode,
      emptyOnMiss: { items: [], total_cost: 0, total_credit: 0, unit: 'USD' },
      loader: async () => {
        const items = await this.billing.yearlyCostAndCredits(account)
        let totalCost = 0
        let totalCredit = 0
        for (const item of items) {
          const cost = Number(item.cost ?? 0)
          const credit = Number(item.credit ?? 0)
          if (!Number.isFinite(cost) || !Number.isFinite(credit)) {
            throw new Error('AWS billing returned non-finite amount')
          }
          totalCost += cost
          totalCredit += credit
        }
        return { items, total_cost: totalCost, total_credit: totalCredit, unit: 'USD' }
      },
    })

    return { ...result.value, meta: result.meta }
  }
}
