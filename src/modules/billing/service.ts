
import { globalCache } from '../../lib/cache/cache-service.js'
import * as v from '../../lib/utils/aws-validator.js'
import { AccountService } from '../account/service.js'
import { BillingProvider } from '../../lib/aws/providers/billing-provider.js'

const TTL = 30 * 60 * 1000

export class BillingService {
  constructor(
    private readonly accounts = new AccountService(),
    private readonly billing = new BillingProvider(),
  ) {}

  async yearlySummary(body: Record<string, unknown>, refresh = false) {
    v.required(body, ['account_id'])
    const accountId = v.accountId(String(body.account_id))
    const account = await this.accounts.requireAccount(accountId)
    const cacheKey = `aws:billing:yearly:${accountId}`
    if (!refresh) {
      const cached = globalCache.get<any>(cacheKey)
      if (cached) return { ...cached, meta: { cache: true, source: 'cache' } }
    }
    const items = await this.billing.yearlyCostAndCredits(account)
    let totalCost = 0
    let totalCredit = 0
    for (const item of items) {
      totalCost += Number(item.cost || 0)
      totalCredit += Number(item.credit || 0)
    }
    const result = { items, total_cost: totalCost, total_credit: totalCredit, unit: 'USD' }
    globalCache.set(cacheKey, result, TTL, [`aws:${accountId}`, `aws:billing:${accountId}`])
    return { ...result, meta: { cache: false, source: 'aws' } }
  }
}
