import { ApiError } from '../../lib/http/api-error.js'
import { awsAccountTags, invalidateAwsCache } from '../../lib/cache/aws-cache.js'
import { maskSecret } from '../../lib/utils/secret-masker.js'
import * as v from '../../lib/utils/aws-validator.js'
import { scalarString } from '../../lib/utils/scalar.js'
import type { AwsAccount, PublicAwsAccount } from '../../types/aws.js'
import { AccountRepository } from './repository.js'
import { LightsailInstanceRepository } from '../lightsail/repository.js'
import { Ec2InstanceRepository } from '../ec2/repository.js'

export class AccountService {
  private mutationChain: Promise<void> = Promise.resolve()

  constructor(
    private readonly accounts: AccountRepository,
    private readonly lightsail: LightsailInstanceRepository,
    private readonly ec2: Ec2InstanceRepository,
  ) {}

  async allPublic(): Promise<PublicAwsAccount[]> {
    return (await this.accounts.all()).map((a) => this.publicAccount(a))
  }

  async findPublic(id: string): Promise<PublicAwsAccount> {
    return this.publicAccount(await this.requireAccount(id))
  }

  async requireAccount(id: string): Promise<AwsAccount> {
    const account = await this.accounts.find(v.accountId(id))
    if (!account) throw new ApiError('account_not_found', 'Account not found', 404, { id })
    return account
  }

  async create(body: Record<string, unknown>): Promise<PublicAwsAccount> {
    return this.serialMutation(() => this.createAccount(body))
  }

  private async createAccount(body: Record<string, unknown>): Promise<PublicAwsAccount> {
    v.required(body, ['id', 'access_key', 'secret_key'])
    const id = v.accountId(scalarString(body.id))
    const account = await this.accounts.create(this.normalize(body, id))
    this.invalidateAccountCaches(account.id)
    return this.publicAccount(account)
  }

  async update(id: string, body: Record<string, unknown>): Promise<PublicAwsAccount> {
    return this.serialMutation(() => this.updateAccount(id, body))
  }

  private async updateAccount(id: string, body: Record<string, unknown>): Promise<PublicAwsAccount> {
    const existing = await this.requireAccount(id)
    const requestedId = scalarString(body.id, id)
    if (requestedId !== id) {
      throw new ApiError('account_id_immutable', 'Account id cannot be changed', 422, { id })
    }
    const merged: Record<string, unknown> = { ...body, id }
    if (merged.secret_key === undefined || String(merged.secret_key).trim() === '') {
      merged.secret_key = existing.secret_key
    }
    const normalized = this.normalize(merged, id)
    const account = await this.accounts.replace(id, normalized)
    this.invalidateAccountCaches(id)
    return this.publicAccount(account)
  }

  async delete(id: string): Promise<void> {
    await this.serialMutation(() => this.deleteAccount(id))
  }

  private async deleteAccount(id: string): Promise<void> {
    id = v.accountId(id)
    await this.requireAccount(id)
    const lightsailSnapshot = await this.lightsail.itemsByAccount(id)
    const ec2Snapshot = await this.ec2.itemsByAccount(id)
    try {
      await this.lightsail.deleteByAccount(id)
      await this.ec2.deleteByAccount(id)
      await this.accounts.delete(id)
      this.invalidateAccountCaches(id)
    } catch (error) {
      await Promise.allSettled([
        this.lightsail.replaceAccount(id, lightsailSnapshot),
        this.ec2.replaceAccount(id, ec2Snapshot),
      ])
      this.invalidateAccountCaches(id)
      throw error
    }
  }

  private serialMutation<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.mutationChain.then(operation, operation)
    this.mutationChain = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }

  private invalidateAccountCaches(...accountIds: string[]): void {
    // Account credentials affect only that account's remote lookups and filtered instance lists.
    // The global tags invalidate aggregate Lightsail/EC2 lists without evicting other accounts' filtered caches.
    const tags = new Set<string>(['lightsail', 'ec2'])
    for (const accountId of accountIds) {
      if (!accountId) continue
      for (const tag of awsAccountTags(accountId)) tags.add(tag)
      tags.add(`lightsail:${accountId}`)
      tags.add(`ec2:${accountId}`)
    }
    invalidateAwsCache([...tags])
  }

  private normalize(data: Record<string, unknown>, fallbackId: string): AwsAccount {
    const id = v.accountId(scalarString(data.id, fallbackId))
    const access_key = scalarString(data.access_key)
    const secret_key = scalarString(data.secret_key)
    const remark = scalarString(data.remark)
    if (!access_key) throw new ApiError('field_required', 'access_key is required', 422, { field: 'access_key' })
    if (!secret_key) throw new ApiError('field_required', 'secret_key is required', 422, { field: 'secret_key' })
    return { id, access_key, secret_key, remark }
  }

  private publicAccount(account: AwsAccount): PublicAwsAccount {
    return {
      id: account.id,
      access_key: account.access_key,
      has_secret_key: account.secret_key.trim() !== '',
      secret_key_masked: maskSecret(account.secret_key),
      remark: account.remark ?? '',
    }
  }
}
