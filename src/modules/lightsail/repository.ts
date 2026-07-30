import { JsonStore } from '../../lib/storage/json-store.js'
import type { LightsailInstance } from '../../types/aws.js'

type StoreShape = { items: LightsailInstance[] }

export class LightsailInstanceRepository {
  constructor(private readonly store: JsonStore<StoreShape>) {}

  async all(): Promise<LightsailInstance[]> {
    const data = await this.store.read()
    return data.items ?? []
  }

  async replaceScope(accountId: string, region: string, items: LightsailInstance[]): Promise<void> {
    await this.store.transaction((current) => {
      const kept = (current.items ?? []).filter((i) => !(i.account_id === accountId && i.region === region))
      return { next: { items: [...kept, ...items] } }
    })
  }

  async updateRemark(accountId: string, region: string, name: string, remark: string): Promise<LightsailInstance | null> {
    let updated: LightsailInstance | null = null
    await this.store.transaction((current) => {
      const items = (current.items ?? []).map((item) => {
        if (item.account_id === accountId && item.region === region && item.name === name) {
          updated = { ...item, remark }
          return updated
        }
        return item
      })
      return { next: { items } }
    })
    return updated
  }

  async itemsByAccount(accountId: string): Promise<LightsailInstance[]> {
    return (await this.all()).filter((item) => item.account_id === accountId)
  }

  async replaceAccount(accountId: string, items: LightsailInstance[]): Promise<void> {
    await this.store.transaction((current) => ({
      next: { items: [...(current.items ?? []).filter((item) => item.account_id !== accountId), ...items] },
    }))
  }

  async deleteByAccount(accountId: string): Promise<void> {
    await this.store.transaction((current) => ({
      next: { items: (current.items ?? []).filter((i) => i.account_id !== accountId) },
    }))
  }

  async renameAccount(oldId: string, newId: string): Promise<void> {
    await this.store.transaction((current) => ({
      next: {
        items: (current.items ?? []).map((i) => (i.account_id === oldId ? { ...i, account_id: newId } : i)),
      },
    }))
  }
}
