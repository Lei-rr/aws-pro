
import { EnableRegionCommand, ListRegionsCommand } from '@aws-sdk/client-account'
import type { AwsAccount } from '../../../types/aws.js'
import { AwsClientFactory } from '../client-factory.js'
import { awsCall } from '../errors.js'

export class RegionProvider {
  constructor(private readonly clients = new AwsClientFactory()) {}

  async regions(account: AwsAccount) {
    return awsCall('account.list_regions', async () => {
      const client = this.clients.account(account)
      const items: Array<{ account_id: string; region: string; status: string }> = []
      let nextToken: string | undefined
      do {
        const result = await client.send(new ListRegionsCommand(nextToken ? { NextToken: nextToken } : {}))
        for (const region of result.Regions ?? []) {
          const name = String(region.RegionName ?? '')
          if (!name) continue
          items.push({ account_id: account.id, region: name, status: String(region.RegionOptStatus ?? 'UNKNOWN') })
        }
        nextToken = result.NextToken || undefined
      } while (nextToken)
      items.sort((a, b) => a.region.localeCompare(b.region))
      return items
    })
  }

  async enable(account: AwsAccount, region: string) {
    return awsCall('account.enable_region', async () => {
      await this.clients.account(account).send(new EnableRegionCommand({ RegionName: region }))
      return { account_id: account.id, region, status: 'ENABLING' }
    })
  }
}
