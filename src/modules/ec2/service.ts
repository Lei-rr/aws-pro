
import { ApiError } from '../../lib/http/api-error.js'
import { CacheTtl, invalidateAwsCache, withAwsCache } from '../../lib/cache/aws-cache.js'
import * as v from '../../lib/utils/aws-validator.js'
import type { Ec2Instance } from '../../types/aws.js'
import { AccountService } from '../account/service.js'
import { Ec2Provider } from '../../lib/aws/providers/ec2-provider.js'
import { Ec2InstanceRepository } from './repository.js'

const AMIS: Record<string, string> = {
  'ubuntu-24.04': 'Ubuntu 24.04 LTS',
  'ubuntu-22.04': 'Ubuntu 22.04 LTS',
  'debian-12': 'Debian 12',
  'amzn-2023': 'Amazon Linux 2023',
}
const INSTANCE_TYPES: Record<string, string> = {
  't3.micro': 't3.micro (2C / 1G)',
  't3.small': 't3.small (2C / 2G)',
  't3.medium': 't3.medium (2C / 4G)',
  't3.large': 't3.large (2C / 8G)',
  't3a.micro': 't3a.micro (2C / 1G)',
  't3a.small': 't3a.small (2C / 2G)',
  't3a.medium': 't3a.medium (2C / 4G)',
  'm6i.large': 'm6i.large (2C / 8G)',
  'c6i.large': 'c6i.large (2C / 4G)',
  'r6i.large': 'r6i.large (2C / 16G)',
}

export class Ec2Service {
  constructor(
    private readonly accounts: AccountService,
    private readonly provider: Ec2Provider,
    private readonly instances: Ec2InstanceRepository,
  ) {}

  options() {
    return { amis: AMIS, instance_types: INSTANCE_TYPES }
  }

  async listCached(accountId?: string, region?: string) {
    const filters = {
      account_id: accountId?.trim() ? v.accountId(accountId) : null,
      region: region?.trim() ? v.region(region) : null,
    }
    const result = await withAwsCache<Ec2Instance[]>({
      key: { prefix: 'aws:ec2:list', parts: { account_id: filters.account_id, region: filters.region } },
      tags: this.tags(filters.account_id),
      ttlMs: CacheTtl.instanceList,
      mode: { refresh: false, cacheOnly: false },
      sourceOnLoad: 'local',
      loader: async () => {
        let items = await this.instances.all()
        if (filters.account_id) items = items.filter((i) => i.account_id === filters.account_id)
        if (filters.region) items = items.filter((i) => i.region === filters.region)
        return [...items].sort((a, b) => `${a.zone}|${a.name}|${a.id}`.localeCompare(`${b.zone}|${b.name}|${b.id}`))
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
    for (const item of await this.instances.all()) remarks.set(`${item.account_id}|${item.region}|${item.id}`, item.remark ?? '')
    const synced = (await this.provider.instances(account, region)).map((item) => ({
      ...item,
      remark: remarks.get(`${item.account_id}|${item.region}|${item.id}`) ?? '',
    }))
    await this.instances.replaceScope(account.id, region, synced)
    invalidateAwsCache(this.tags(account.id))
    return { instances: synced, count: synced.length, account_id: account.id, region }
  }

  async createInstance(accountId: string, region: string, data: Record<string, unknown>) {
    const account = await this.accounts.requireAccount(accountId)
    region = v.region(region)
    await this.provider.createInstance(account, region, this.normalizeCreate(data))
    invalidateAwsCache(this.tags(account.id))
    try {
      return await this.sync(account.id, region)
    } catch (error) {
      return {
        created: true,
        account_id: account.id,
        region,
        warnings: [{ code: 'post_create_sync_failed', message: error instanceof Error ? error.message : String(error) }],
      }
    }
  }

  async runAction(accountId: string, region: string, instanceId: string, input: Record<string, unknown>) {
    const account = await this.accounts.requireAccount(accountId)
    region = v.region(region)
    instanceId = this.instanceId(instanceId)
    const action = this.normalizeAction(input)
    switch (action) {
      case 'allocate_static_ip':
        await this.provider.allocateStaticIp(account, region, instanceId)
        break
      case 'release_static_ip':
        await this.provider.releaseStaticIp(account, region, instanceId)
        break
      case 'start':
        await this.provider.startInstance(account, region, instanceId)
        break
      case 'stop':
        await this.provider.stopInstance(account, region, instanceId)
        break
      case 'reboot':
        await this.provider.rebootInstance(account, region, instanceId)
        break
      case 'terminate':
        await this.provider.terminateInstance(account, region, instanceId)
        break
      case 'open_ports':
        await this.provider.openAllPorts(account, region, instanceId)
        break
      default:
        throw new ApiError('ec2_action_invalid', 'Invalid EC2 action', 422, { action })
    }
    invalidateAwsCache(this.tags(account.id))
    return `${action} submitted`
  }

  async updateRemark(accountId: string, region: string, instanceId: string, remark: string) {
    accountId = v.accountId(accountId)
    region = v.region(region)
    instanceId = this.instanceId(instanceId)
    const updated = await this.instances.updateRemark(accountId, region, instanceId, remark.trim())
    if (!updated) throw new ApiError('ec2_instance_not_found', 'EC2 instance not found', 404, { instance: instanceId })
    invalidateAwsCache(this.tags(accountId))
    return updated
  }

  private normalizeCreate(data: Record<string, unknown>) {
    v.required(data, ['name', 'ami', 'instance_type'])
    const ami = String(data.ami).trim()
    if (!AMIS[ami] && !ami.startsWith('ami-')) throw new ApiError('ec2_ami_invalid', 'Invalid EC2 AMI', 422, { ami })
    const instanceType = String(data.instance_type).trim()
    if (!INSTANCE_TYPES[instanceType]) throw new ApiError('ec2_instance_type_invalid', 'Invalid instance type', 422)
    return {
      name: v.instanceName(String(data.name)),
      ami,
      instance_type: instanceType,
      root_password: String(data.root_password ?? ''),
      enable_ipv6: Boolean(data.enable_ipv6),
      client_token: String(data.client_token ?? ''),
    }
  }

  private normalizeAction(data: Record<string, unknown>) {
    const action = String(data.action ?? '').trim()
    const allowed = ['allocate_static_ip', 'release_static_ip', 'start', 'stop', 'reboot', 'terminate', 'open_ports']
    if (!allowed.includes(action)) throw new ApiError('ec2_action_invalid', 'Invalid EC2 action', 422, { action })
    if (String(data.confirm ?? '') !== action) throw new ApiError('ec2_action_confirm_required', 'Action confirmation is required', 422, { action })
    return action
  }

  private instanceId(id: string) {
    const value = id.trim()
    if (!/^i-[a-z0-9]+$/i.test(value)) throw new ApiError('ec2_instance_id_invalid', 'Invalid EC2 instance id', 422)
    return value
  }

  private tags(accountId?: string | null) {
    return accountId ? [`ec2:${accountId}`, 'ec2'] : ['ec2']
  }
}
