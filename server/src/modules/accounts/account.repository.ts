import { ApiError } from '../../shared/http/api-error.js'
import { JsonStore } from '../../platform/storage/json-store.js'
import type { AwsAccount } from '../../shared/aws/aws.types.js'

type StoreShape = { items: AwsAccount[] }

export class AccountRepository {
  constructor(private readonly store: JsonStore<StoreShape>) {}

  async all(): Promise<AwsAccount[]> {
    const data = await this.store.read()
    return (data.items ?? []).map((row) => this.present(row))
  }

  async find(id: string): Promise<AwsAccount | null> {
    return (await this.all()).find((account) => account.id === id) ?? null
  }

  async create(account: AwsAccount): Promise<AwsAccount> {
    const now = Date.now()
    let created!: AwsAccount
    await this.store.transaction((current) => {
      const items = current.items ?? []
      if (items.some((item) => item.id === account.id)) {
        throw new ApiError('account_already_exists', 'Account already exists', 409, { id: account.id })
      }
      created = { ...account, created_at: now, updated_at: now }
      return { next: { ...current, items: [...items, created] } }
    })
    return this.present(created)
  }

  async replace(id: string, account: AwsAccount): Promise<AwsAccount> {
    const now = Date.now()
    let updated: AwsAccount | null = null
    await this.store.transaction((current) => {
      const items = current.items ?? []
      const index = items.findIndex((item) => item.id === id)
      if (index === -1) throw new ApiError('account_not_found', 'Account not found', 404, { id })
      if (account.id !== id && items.some((item) => item.id === account.id)) {
        throw new ApiError('account_already_exists', 'Account already exists', 409, { id: account.id })
      }
      updated = {
        ...account,
        created_at: items[index]?.created_at ?? now,
        updated_at: now,
      }
      const next = [...items]
      next[index] = updated
      return { next: { ...current, items: next } }
    })
    return this.present(updated!)
  }

  async delete(id: string): Promise<void> {
    await this.store.transaction((current) => {
      const items = current.items ?? []
      if (!items.some((item) => item.id === id)) {
        throw new ApiError('account_not_found', 'Account not found', 404, { id })
      }
      return { next: { ...current, items: items.filter((item) => item.id !== id) } }
    })
  }

  private present(row: AwsAccount): AwsAccount {
    return {
      id: String(row.id ?? ''),
      access_key: String(row.access_key ?? ''),
      secret_key: String(row.secret_key ?? ''),
      remark: String(row.remark ?? ''),
      created_at: row.created_at,
      updated_at: row.updated_at,
    }
  }
}
