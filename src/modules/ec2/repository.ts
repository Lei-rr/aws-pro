import { JsonStore } from '../../lib/storage/json-store.js'
import type { Ec2Instance } from '../../types/aws.js'

type StoreShape = { items: Ec2Instance[] }

export class Ec2InstanceRepository {
  constructor(private readonly store: JsonStore<StoreShape>) {}

  async all(): Promise<Ec2Instance[]> {
    const data = await this.store.read()
    return data.items ?? []
  }

  async replaceScope(accountId: string, region: string, items: Ec2Instance[]): Promise<void> {
    await this.store.transaction((current) => {
      const kept = (current.items ?? []).filter((i) => !(i.account_id === accountId && i.region === region))
      return { next: { items: [...kept, ...items] } }
    })
  }

  async updateRemark(accountId: string, region: string, id: string, remark: string): Promise<Ec2Instance | null> {
    let updated: Ec2Instance | null = null
    await this.store.transaction((current) => {
      const items = (current.items ?? []).map((item) => {
        if (item.account_id === accountId && item.region === region && item.id === id) {
          updated = { ...item, remark }
          return updated
        }
        return item
      })
      return { next: { items } }
    })
    return updated
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
