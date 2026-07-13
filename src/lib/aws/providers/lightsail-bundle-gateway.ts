
import { GetBundlesCommand } from '@aws-sdk/client-lightsail'
import type { AwsAccount } from '../../../types/aws.js'
import { AwsClientFactory } from '../client-factory.js'
import { awsCall } from '../errors.js'

export class LightsailBundleGateway {
  constructor(private readonly clients = new AwsClientFactory()) {}

  async bundles(account: AwsAccount, region: string) {
    return awsCall('lightsail.bundles', async () => {
      const result = await this.clients.lightsail(account, region).send(new GetBundlesCommand({}))
      const items: Record<string, any> = {}
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
      return items
    })
  }

  private bundleLabel(bundleId: string, bundle: any) {
    const transfer = bundle.transferPerMonthInGb ? Math.round((bundle.transferPerMonthInGb / 1024) * 100) / 100 : '-'
    return `${bundle.name ?? bundleId} | ${bundle.cpuCount ?? '-'} cpu | ${bundle.ramSizeInGb ?? '-'}GB RAM | ${bundle.diskSizeInGb ?? '-'}GB disk | ${transfer}TB transfer | $${bundle.price ?? '-'}/month`
  }

  private bundleSpecs(bundle: any) {
    return {
      cpu: bundle.cpuCount ?? null,
      memory: bundle.ramSizeInGb ?? null,
      disk: bundle.diskSizeInGb ?? null,
      transfer: bundle.transferPerMonthInGb ? bundle.transferPerMonthInGb / 1024 : null,
      price: bundle.price ?? null,
    }
  }

  private isIpv6Only(bundleId: string, bundle: any) {
    if (bundle.publicIpv4AddressCount !== undefined && bundle.publicIpv4AddressCount !== null) {
      return Number(bundle.publicIpv4AddressCount) === 0
    }
    return bundleId.includes('_ipv6_')
  }
}
