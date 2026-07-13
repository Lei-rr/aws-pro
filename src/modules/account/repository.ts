import { JsonStore } from '../../lib/storage/json-store.js'
import type { AwsAccount } from '../../types/aws.js'

type StoreShape = { items: AwsAccount[] }

export class AccountRepository {
  constructor(private readonly store = new JsonStore<StoreShape>('accounts.json', { items: [] })) {}

  async all(): Promise<AwsAccount[]> {
    const data = await this.store.read()
    return (data.items ?? []).map((row) => ({
      id: String(row.id ?? ''),
      access_key: String(row.access_key ?? ''),
      secret_key: String(row.secret_key ?? ''),
      remark: String(row.remark ?? ''),
      created_at: row.created_at,
      updated_at: row.updated_at,
    }))
  }

  async find(id: string): Promise<AwsAccount | null> {
    return (await this.all()).find((a) => a.id === id) ?? null
  }

  async saveAll(accounts: AwsAccount[]): Promise<void> {
    const now = Date.now()
    const items = accounts.map((account, index) => ({
      id: account.id,
      access_key: account.access_key,
      secret_key: account.secret_key,
      remark: account.remark ?? '',
      sort_order: index,
      created_at: account.created_at ?? now,
      updated_at: now,
    }))
    await this.store.transaction((current) => ({ next: { ...current, items } }))
  }
}
