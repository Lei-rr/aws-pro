import { ApiError } from '../../lib/http/api-error.js'
import { maskSecret } from '../../lib/utils/secret-masker.js'
import * as v from '../../lib/utils/aws-validator.js'
import type { AwsAccount, PublicAwsAccount } from '../../types/aws.js'
import { AccountRepository } from './repository.js'
import { LightsailInstanceRepository } from '../lightsail/repository.js'
import { Ec2InstanceRepository } from '../ec2/repository.js'

export class AccountService {
  constructor(
    private readonly accounts = new AccountRepository(),
    private readonly lightsail = new LightsailInstanceRepository(),
    private readonly ec2 = new Ec2InstanceRepository(),
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
    v.required(body, ['id', 'access_key', 'secret_key'])
    const id = v.accountId(String(body.id))
    if (await this.accounts.find(id)) throw new ApiError('account_already_exists', 'Account already exists', 409, { id })
    const account = this.normalize(body, id)
    const all = await this.accounts.all()
    all.push(account)
    await this.accounts.saveAll(all)
    return this.publicAccount(account)
  }

  async update(id: string, body: Record<string, unknown>): Promise<PublicAwsAccount> {
    const existing = await this.requireAccount(id)
    const merged = { ...body }
    if (merged.secret_key === undefined || String(merged.secret_key).trim() === '') {
      merged.secret_key = existing.secret_key
    }
    const account = this.normalize(merged, id)
    const newId = account.id
    if (newId !== id && (await this.accounts.find(newId))) {
      throw new ApiError('account_already_exists', 'Account already exists', 409, { id: newId })
    }
    const all = (await this.accounts.all()).filter((a) => a.id !== id)
    all.push(account)
    await this.accounts.saveAll(all)
    if (newId !== id) {
      await this.lightsail.renameAccount(id, newId)
      await this.ec2.renameAccount(id, newId)
    }
    return this.publicAccount(account)
  }

  async delete(id: string): Promise<void> {
    await this.requireAccount(id)
    const all = (await this.accounts.all()).filter((a) => a.id !== id)
    await this.accounts.saveAll(all)
    await this.lightsail.deleteByAccount(id)
    await this.ec2.deleteByAccount(id)
  }

  private normalize(data: Record<string, unknown>, fallbackId: string): AwsAccount {
    const id = v.accountId(String(data.id ?? fallbackId))
    const access_key = String(data.access_key ?? '').trim()
    const secret_key = String(data.secret_key ?? '').trim()
    const remark = String(data.remark ?? '').trim()
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
