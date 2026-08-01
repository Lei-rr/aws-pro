import { JsonStore } from '../../platform/storage/json-store.js'
import type { AwsAccountLookup } from '../../shared/aws/account-lookup.js'
import { withAccountMutation } from '../../shared/aws/account-mutation.js'
import type { Ec2Instance } from '../../shared/aws/aws.types.js'

type StoreShape = { items: Ec2Instance[] }

export class Ec2InstanceRepository {
  constructor(
    private readonly store: JsonStore<StoreShape>,
    private readonly accounts: AwsAccountLookup
  ) {}

  async all(): Promise<Ec2Instance[]> {
    const data = await this.store.read()
    return data.items ?? []
  }

  async replaceScope(accountId: string, region: string, items: Ec2Instance[]): Promise<void> {
    await withAccountMutation(accountId, async () => {
      await this.accounts.requireAccount(accountId)
      await this.store.transaction((current) => {
        const kept = (current.items ?? []).filter((item) => !(item.account_id === accountId && item.region === region))
        return { next: { items: [...kept, ...items] } }
      })
    })
  }

  async updateRemark(accountId: string, region: string, id: string, remark: string): Promise<Ec2Instance | null> {
    return withAccountMutation(accountId, async () => {
      await this.accounts.requireAccount(accountId)
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
    })
  }

  async itemsByAccount(accountId: string): Promise<Ec2Instance[]> {
    return (await this.all()).filter((item) => item.account_id === accountId)
  }

  /** Account-removal workflow only; caller owns the account mutation lock. */
  async replaceAccount(accountId: string, items: Ec2Instance[]): Promise<void> {
    await this.store.transaction((current) => ({
      next: { items: [...(current.items ?? []).filter((item) => item.account_id !== accountId), ...items] },
    }))
  }

  /** Account-removal workflow only; caller owns the account mutation lock. */
  async deleteByAccount(accountId: string): Promise<void> {
    await this.store.transaction((current) => ({
      next: { items: (current.items ?? []).filter((item) => item.account_id !== accountId) },
    }))
  }

  async renameAccount(oldId: string, newId: string): Promise<void> {
    await this.store.transaction((current) => ({
      next: {
        items: (current.items ?? []).map((item) => (item.account_id === oldId ? { ...item, account_id: newId } : item)),
      },
    }))
  }
}
