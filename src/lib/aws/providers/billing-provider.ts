
import { GetCostAndUsageCommand } from '@aws-sdk/client-cost-explorer'
import type { AwsAccount } from '../../../types/aws.js'
import { AwsClientFactory } from '../client-factory.js'
import { awsCall } from '../errors.js'

function ymd(d: Date) {
  return d.toISOString().slice(0, 10)
}

export class BillingProvider {
  constructor(private readonly clients: AwsClientFactory) {}

  async yearlyCostAndCredits(account: AwsAccount) {
    return awsCall('billing.yearly', async () => {
      const client = this.clients.costExplorer(account)
      const end = new Date()
      end.setDate(end.getDate() + 1)
      const start = new Date()
      start.setMonth(start.getMonth() - 12)
      start.setDate(1)
      const base = {
        TimePeriod: { Start: ymd(start), End: ymd(end) },
        Granularity: 'MONTHLY' as const,
        Metrics: ['UnblendedCost'],
      }
      const costs: Record<string, string> = {}
      const credits: Record<string, string> = {}
      const costResult = await client.send(new GetCostAndUsageCommand(base))
      for (const row of costResult.ResultsByTime ?? []) {
        const month = String(row.TimePeriod?.Start ?? '').slice(0, 7)
        costs[month] = String(row.Total?.UnblendedCost?.Amount ?? '0')
      }
      const creditResult = await client.send(
        new GetCostAndUsageCommand({
          ...base,
          Filter: { Dimensions: { Key: 'RECORD_TYPE', Values: ['Credit'] } },
        }),
      )
      for (const row of creditResult.ResultsByTime ?? []) {
        const month = String(row.TimePeriod?.Start ?? '').slice(0, 7)
        credits[month] = String(row.Total?.UnblendedCost?.Amount ?? '0')
      }
      const months = Array.from(new Set([...Object.keys(costs), ...Object.keys(credits)])).sort().reverse()
      return months.map((month) => ({
        account_id: account.id,
        month,
        cost: costs[month] ?? '0',
        credit: credits[month] ?? '0',
        unit: 'USD',
      }))
    })
  }
}
