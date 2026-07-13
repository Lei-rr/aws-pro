
import { GetServiceQuotaCommand } from '@aws-sdk/client-service-quotas'
import type { AwsAccount } from '../../../types/aws.js'
import { AwsClientFactory } from '../client-factory.js'

const CODES: Record<string, string> = {
  'L-1216C47A': 'On-Demand Standard vCPU',
  'L-34B43A08': 'Spot Standard vCPU',
}

export class QuotaProvider {
  constructor(private readonly clients = new AwsClientFactory()) {}

  async vcpuQuota(account: AwsAccount, region: string) {
    const client = this.clients.serviceQuotas(account, region)
    const items: Array<Record<string, unknown>> = []
    for (const [code, fallbackName] of Object.entries(CODES)) {
      try {
        const result = await client.send(new GetServiceQuotaCommand({ ServiceCode: 'ec2', QuotaCode: code }))
        const quota = result.Quota ?? {}
        items.push({
          account_id: account.id,
          region,
          name: quota.QuotaName ?? fallbackName,
          value: quota.Value ?? '',
        })
      } catch {
        items.push({ account_id: account.id, region, name: fallbackName, value: '-', error: true })
      }
    }
    return items
  }
}
