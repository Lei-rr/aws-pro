import { ApiError } from '../../shared/http/api-error.js'
import { invalidateAwsCache, withAwsCache } from '../../platform/cache/aws-cache.js'
import * as v from '../../shared/aws/aws-validator.js'
import { scalarString } from '../../shared/lib/scalar.js'
import type { LightsailInstance } from '../../shared/aws/aws.types.js'
import { LightsailProvider } from './lightsail.client.js'
import { LightsailBundleGateway, type LightsailBundleMeta } from './lightsail-bundle.client.js'
import { LightsailInstanceRepository } from './lightsail.repository.js'
import type { AwsAccountLookup } from '../../shared/aws/account-lookup.js'

export class LightsailService {
  constructor(
    private readonly accounts: AwsAccountLookup,
    private readonly provider: LightsailProvider,
    private readonly bundles: LightsailBundleGateway,
    private readonly instances: LightsailInstanceRepository
  ) {}

  async listCached(accountId?: string, region?: string, refresh = false) {
    const filters = this.normalizeListFilters(accountId, region)
    const result = await withAwsCache<LightsailInstance[]>({
      key: { prefix: 'aws:lightsail:list', parts: { account_id: filters.account_id, region: filters.region } },
      tags: this.tags(filters.account_id),
      // Local JSON is source of truth; memory only avoids re-reading/filtering every request.
      mode: { refresh, cacheOnly: false },
      sourceOnLoad: 'local',
      loader: async () => {
        let items = await this.instances.all()
        if (filters.account_id) items = items.filter((i) => i.account_id === filters.account_id)
        if (filters.region) items = items.filter((i) => i.region === filters.region)
        return [...items].sort((a, b) => `${a.zone}|${a.name}`.localeCompare(`${b.zone}|${b.name}`))
      },
    })
    return {
      items: result.value,
      meta: result.meta,
    }
  }

  async sync(accountId: string, region: string) {
    const account = await this.accounts.requireAccount(accountId)
    region = v.region(region)
    const remarks = new Map<string, string>()
    for (const item of await this.instances.all()) {
      remarks.set(`${item.account_id}|${item.region}|${item.name}`, item.remark ?? '')
    }
    const bundleSpecs: Record<string, LightsailBundleMeta['specs']> = {}
    const warnings: Array<{ code: string; message: string }> = []
    try {
      const all = await this.bundles.bundles(account, region)
      for (const [id, meta] of Object.entries(all)) bundleSpecs[id] = meta.specs
    } catch {
      warnings.push({ code: 'bundle_specs_unavailable', message: '套餐规格暂未获取，实例同步已继续' })
    }
    const synced = (await this.provider.instances(account, region)).map((item) => {
      const key = `${item.account_id}|${item.region}|${item.name}`
      return {
        ...item,
        remark: remarks.get(key) ?? '',
        bundle_specs: bundleSpecs[item.bundle_id ?? ''] ?? {},
      }
    })
    await this.instances.replaceScope(account.id, region, synced)
    invalidateAwsCache(this.mutationTags(account.id))
    return { instances: synced, count: synced.length, account_id: account.id, region, warnings }
  }

  async createOptions(accountId: string, region: string) {
    const account = await this.accounts.requireAccount(accountId)
    region = v.region(region)
    const zones = await this.provider.availabilityZones(account, region)
    const bundleMap = await this.bundles.bundles(account, region)
    const labels: Record<string, string> = {}
    const items: Array<{ id: string } & LightsailBundleMeta> = []
    for (const [id, meta] of Object.entries(bundleMap)) {
      labels[id] = meta.label
      items.push({ id, ...meta })
    }
    return { zones, bundles: labels, bundle_items: items }
  }

  async createInstance(accountId: string, region: string, data: Record<string, unknown>) {
    const account = await this.accounts.requireAccount(accountId)
    region = v.region(region)
    const normalized = this.normalizeCreate(data)
    await this.provider.createInstance(account, region, normalized)
    invalidateAwsCache(this.mutationTags(account.id))
    try {
      return await this.sync(account.id, region)
    } catch (error) {
      return {
        created: true,
        account_id: account.id,
        region,
        warnings: [
          { code: 'post_create_sync_failed', message: error instanceof Error ? error.message : String(error) },
        ],
      }
    }
  }

  async updateRemark(accountId: string, region: string, instanceName: string, remark: string) {
    accountId = v.accountId(accountId)
    region = v.region(region)
    instanceName = v.instanceName(instanceName)
    const updated = await this.instances.updateRemark(accountId, region, instanceName, remark.trim())
    if (!updated) throw new ApiError('instance_not_found', 'Instance not found', 404, { instance: instanceName })
    invalidateAwsCache(this.mutationTags(accountId))
    return updated
  }

  async runAction(accountId: string, region: string, instanceName: string, input: Record<string, unknown>) {
    const account = await this.accounts.requireAccount(accountId)
    region = v.region(region)
    instanceName = v.instanceName(instanceName)
    const action = this.normalizeAction(input)
    switch (action) {
      case 'allocate_static_ip':
        await this.provider.allocateStaticIp(account, region, instanceName)
        break
      case 'release_static_ip':
        await this.provider.releaseStaticIp(account, region, instanceName)
        break
      case 'start':
        await this.provider.startInstance(account, region, instanceName)
        break
      case 'stop':
        await this.provider.stopInstance(account, region, instanceName)
        break
      case 'reboot':
        await this.provider.rebootInstance(account, region, instanceName)
        break
      case 'open_ports':
        await this.provider.openAllPorts(account, region, instanceName)
        break
      case 'delete':
        await this.provider.deleteInstance(account, region, instanceName)
        break
      default:
        throw new ApiError('lightsail_action_invalid', 'Invalid Lightsail action', 422, { action })
    }
    invalidateAwsCache(this.mutationTags(account.id))
    return `${action} submitted`
  }

  private normalizeListFilters(accountId?: string, region?: string) {
    return {
      account_id: accountId?.trim() ? v.accountId(accountId) : null,
      region: region?.trim() ? v.region(region) : null,
    }
  }

  private normalizeCreate(data: Record<string, unknown>) {
    v.required(data, ['name', 'zone', 'blueprint', 'bundle'])
    const ip = scalarString(data.ip_address_type, 'dualstack')
    if (!['dualstack', 'ipv4', 'ipv6'].includes(ip)) {
      throw new ApiError('ip_address_type_invalid', 'Invalid ip_address_type', 422)
    }
    return {
      name: v.instanceName(scalarString(data.name)),
      zone: scalarString(data.zone),
      blueprint: scalarString(data.blueprint),
      bundle: scalarString(data.bundle),
      ip_address_type: ip,
      root_password: scalarString(data.root_password),
    }
  }

  private normalizeAction(data: Record<string, unknown>) {
    const action = scalarString(data.action)
    const allowed = ['allocate_static_ip', 'release_static_ip', 'start', 'stop', 'reboot', 'delete', 'open_ports']
    if (!allowed.includes(action))
      throw new ApiError('lightsail_action_invalid', 'Invalid Lightsail action', 422, { action })
    if (scalarString(data.confirm) !== action) {
      throw new ApiError('lightsail_action_confirm_required', 'Action confirmation is required', 422, { action })
    }
    return action
  }

  private tags(accountId?: string | null) {
    return accountId ? [`lightsail:${accountId}`] : ['lightsail']
  }

  private mutationTags(accountId: string) {
    return [`lightsail:${accountId}`, 'lightsail']
  }
}
