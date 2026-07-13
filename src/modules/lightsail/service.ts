
import { ApiError } from '../../lib/http/api-error.js'
import { globalCache } from '../../lib/cache/cache-service.js'
import * as v from '../../lib/utils/aws-validator.js'
import type { LightsailInstance } from '../../types/aws.js'
import { LightsailProvider } from '../../lib/aws/providers/lightsail-provider.js'
import { LightsailBundleGateway } from '../../lib/aws/providers/lightsail-bundle-gateway.js'
import { LightsailInstanceRepository } from './repository.js'
import { AccountService } from '../account/service.js'

const TTL = 5 * 60 * 1000

export class LightsailService {
  constructor(
    private readonly accounts = new AccountService(),
    private readonly provider = new LightsailProvider(),
    private readonly bundles = new LightsailBundleGateway(),
    private readonly instances = new LightsailInstanceRepository(),
  ) {}

  async listCached(accountId?: string, region?: string) {
    const filters = this.normalizeListFilters(accountId, region)
    const cacheKey = `lightsail.list:${filters.account_id ?? ''}:${filters.region ?? ''}`
    const cached = globalCache.get<LightsailInstance[]>(cacheKey)
    if (cached) return { items: cached, meta: { cache: true, source: 'cache' } }
    let items = await this.instances.all()
    if (filters.account_id) items = items.filter((i) => i.account_id === filters.account_id)
    if (filters.region) items = items.filter((i) => i.region === filters.region)
    items = [...items].sort((a, b) => `${a.zone}|${a.name}`.localeCompare(`${b.zone}|${b.name}`))
    globalCache.set(cacheKey, items, TTL, this.tags(filters.account_id))
    return { items, meta: { cache: false, source: 'local' } }
  }

  async sync(accountId: string, region: string) {
    const account = await this.accounts.requireAccount(accountId)
    region = v.region(region)
    const remarks = new Map<string, string>()
    for (const item of await this.instances.all()) {
      remarks.set(`${item.account_id}|${item.region}|${item.name}`, item.remark ?? '')
    }
    let bundleSpecs: Record<string, any> = {}
    const warnings: any[] = []
    try {
      const all = await this.bundles.bundles(account, region)
      for (const [id, meta] of Object.entries(all)) bundleSpecs[id] = (meta as any).specs ?? {}
    } catch (error) {
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
    globalCache.invalidateTags(this.tags(account.id))
    return { instances: synced, count: synced.length, account_id: account.id, region, warnings }
  }

  async createOptions(accountId: string, region: string) {
    const account = await this.accounts.requireAccount(accountId)
    region = v.region(region)
    const zones = await this.provider.availabilityZones(account, region)
    const bundleMap = await this.bundles.bundles(account, region)
    const labels: Record<string, string> = {}
    const items: any[] = []
    for (const [id, meta] of Object.entries(bundleMap)) {
      labels[id] = (meta as any).label
      items.push({ id, ...(meta as any) })
    }
    return { zones, bundles: labels, bundle_items: items }
  }

  async createInstance(accountId: string, region: string, data: Record<string, unknown>) {
    const account = await this.accounts.requireAccount(accountId)
    region = v.region(region)
    const normalized = this.normalizeCreate(data)
    await this.provider.createInstance(account, region, normalized)
    globalCache.invalidateTags(this.tags(account.id))
    return this.sync(account.id, region)
  }

  async updateRemark(accountId: string, region: string, instanceName: string, remark: string) {
    accountId = v.accountId(accountId)
    region = v.region(region)
    instanceName = v.instanceName(instanceName)
    const updated = await this.instances.updateRemark(accountId, region, instanceName, remark.trim())
    if (!updated) throw new ApiError('instance_not_found', 'Instance not found', 404, { instance: instanceName })
    globalCache.invalidateTags(this.tags(accountId))
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
    globalCache.invalidateTags(this.tags(account.id))
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
    const ip = String(data.ip_address_type ?? 'dualstack')
    if (!['dualstack', 'ipv4', 'ipv6'].includes(ip)) {
      throw new ApiError('ip_address_type_invalid', 'Invalid ip_address_type', 422)
    }
    return {
      name: v.instanceName(String(data.name)),
      zone: String(data.zone).trim(),
      blueprint: String(data.blueprint).trim(),
      bundle: String(data.bundle).trim(),
      ip_address_type: ip,
      root_password: String(data.root_password ?? ''),
    }
  }

  private normalizeAction(data: Record<string, unknown>) {
    const action = String(data.action ?? '').trim()
    const allowed = ['allocate_static_ip', 'release_static_ip', 'start', 'stop', 'reboot', 'delete', 'open_ports']
    if (!allowed.includes(action)) throw new ApiError('lightsail_action_invalid', 'Invalid Lightsail action', 422, { action })
    if (String(data.confirm ?? '') !== action) {
      throw new ApiError('lightsail_action_confirm_required', 'Action confirmation is required', 422, { action })
    }
    return action
  }

  private tags(accountId?: string | null) {
    return accountId ? [`lightsail:${accountId}`, 'lightsail'] : ['lightsail']
  }
}
