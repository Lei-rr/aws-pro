
import { globalCache } from '../../lib/cache/cache-service.js'
import * as v from '../../lib/utils/aws-validator.js'
import { AccountService } from '../account/service.js'
import { QuotaProvider } from '../../lib/aws/providers/quota-provider.js'

const TTL = 10 * 60 * 1000

export class QuotaService {
  constructor(
    private readonly accounts = new AccountService(),
    private readonly provider = new QuotaProvider(),
  ) {}

  async vcpuQuota(body: Record<string, unknown>, refresh = false) {
    v.required(body, ['account_id', 'region'])
    const accountId = v.accountId(String(body.account_id))
    const region = v.region(String(body.region))
    const account = await this.accounts.requireAccount(accountId)
    const cacheKey = `aws:quota:vcpu:${accountId}:${region}`
    if (!refresh) {
      const cached = globalCache.get<any[]>(cacheKey)
      if (cached) return { items: cached, meta: { cache: true, source: 'cache' } }
    }
    const items = await this.provider.vcpuQuota(account, region)
    globalCache.set(cacheKey, items, TTL, [`aws:${accountId}`, `aws:quota:${accountId}`])
    return { items, meta: { cache: false, source: 'aws' } }
  }
}
