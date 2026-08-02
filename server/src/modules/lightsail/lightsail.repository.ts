import { JsonStore } from '../../platform/storage/json-store.js'
import type { AwsAccountLookup } from '../../shared/aws/account-lookup.js'
import { withAccountMutation } from '../../shared/aws/account-mutation.js'
import type { LightsailInstance } from '../../shared/aws/aws.types.js'

type StoreShape = { items: LightsailInstance[] }

export class LightsailInstanceRepository {
  constructor(
    private readonly store: JsonStore<StoreShape>,
    private readonly accounts: AwsAccountLookup
  ) {}

  async all(): Promise<LightsailInstance[]> {
    const data = await this.store.read()
    return data.items ?? []
  }

  async replaceScope(accountId: string, region: string, items: LightsailInstance[]): Promise<void> {
    await withAccountMutation(accountId, async () => {
      await this.accounts.requireAccount(accountId)
      await this.store.transaction((current) => {
        const kept = (current.items ?? []).filter((item) => !(item.account_id === accountId && item.region === region))
        return { next: { items: [...kept, ...items] } }
      })
    })
  }

  async updateRemark(
    accountId: string,
    region: string,
    name: string,
    remark: string
  ): Promise<LightsailInstance | null> {
    return withAccountMutation(accountId, async () => {
      await this.accounts.requireAccount(accountId)
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
    })
  }

  async itemsByAccount(accountId: string): Promise<LightsailInstance[]> {
    return (await this.all()).filter((item) => item.account_id === accountId)
  }

  /** Account-removal workflow only; caller owns the account mutation lock. */
  async replaceAccount(accountId: string, items: LightsailInstance[]): Promise<void> {
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
