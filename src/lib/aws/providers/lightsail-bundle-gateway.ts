
import { GetBundlesCommand, type Bundle } from '@aws-sdk/client-lightsail'
import type { AwsAccount } from '../../../types/aws.js'
import { AwsClientFactory } from '../client-factory.js'
import { awsCall } from '../errors.js'

export type LightsailBundleMeta = {
  label: string
  specs: Record<string, number | null>
  public_ipv4_count: number | null
  is_ipv6_only: boolean
}

export class LightsailBundleGateway {
  constructor(private readonly clients: AwsClientFactory) {}

  async bundles(account: AwsAccount, region: string) {
    return awsCall('lightsail.bundles', async () => {
      const client = this.clients.lightsail(account, region)
      const items: Record<string, LightsailBundleMeta> = {}
      let pageToken: string | undefined
      do {
        const result = await client.send(new GetBundlesCommand({ pageToken }))
        for (const item of result.bundles ?? []) {
          const bundleId = String(item.bundleId ?? '')
          if (!bundleId) continue
          items[bundleId] = {
            label: this.bundleLabel(bundleId, item),
            specs: this.bundleSpecs(item),
            public_ipv4_count: item.publicIpv4AddressCount ?? null,
            is_ipv6_only: this.isIpv6Only(bundleId, item),
          }
        }
        pageToken = result.nextPageToken
      } while (pageToken)
      return items
    })
  }

  private bundleLabel(bundleId: string, bundle: Bundle) {
    const transfer = bundle.transferPerMonthInGb ? Math.round((bundle.transferPerMonthInGb / 1024) * 100) / 100 : '-'
    return `${bundle.name ?? bundleId} | ${bundle.cpuCount ?? '-'} cpu | ${bundle.ramSizeInGb ?? '-'}GB RAM | ${bundle.diskSizeInGb ?? '-'}GB disk | ${transfer}TB transfer | $${bundle.price ?? '-'}/month`
  }

  private bundleSpecs(bundle: Bundle) {
    return {
      cpu: bundle.cpuCount ?? null,
      memory: bundle.ramSizeInGb ?? null,
      disk: bundle.diskSizeInGb ?? null,
      transfer: bundle.transferPerMonthInGb ? bundle.transferPerMonthInGb / 1024 : null,
      price: bundle.price ?? null,
    }
  }

  private isIpv6Only(bundleId: string, bundle: Bundle) {
    if (bundle.publicIpv4AddressCount !== undefined && bundle.publicIpv4AddressCount !== null) {
      return Number(bundle.publicIpv4AddressCount) === 0
    }
    return bundleId.includes('_ipv6_')
  }
}
