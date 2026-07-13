import crypto from 'node:crypto'
import { JsonStore } from '../../lib/storage/json-store.js'
import type { NewbieTask } from '../../types/aws.js'

type StoreShape = { items: NewbieTask[] }

export class NewbieTaskRepository {
  constructor(private readonly store = new JsonStore<StoreShape>('newbie-tasks.json', { items: [] })) {}

  async all(): Promise<NewbieTask[]> {
    const data = await this.store.read()
    return data.items ?? []
  }

  async find(id: string): Promise<NewbieTask | null> {
    return (await this.all()).find((t) => t.id === id) ?? null
  }

  async create(accountId: string, step: string, stepLabel: string): Promise<NewbieTask | null> {
    const now = Date.now()
    let created: NewbieTask | null = null
    await this.store.transaction((current) => {
      const items = current.items ?? []
      if (items.some((t) => ['pending', 'running', 'cancelling'].includes(t.status))) {
        return { next: current }
      }
      created = {
        id: crypto.randomBytes(8).toString('hex'),
        account_id: accountId,
        step,
        step_label: stepLabel,
        status: 'pending',
        message: 'pending',
        operation_ids: {
          budget: crypto.randomUUID(),
          ec2: crypto.randomUUID(),
          lambda: crypto.randomUUID(),
          rds: crypto.randomUUID(),
        },
        created_at: now,
        updated_at: now,
      }
      return { next: { items: [...items, created] } }
    })
    return created
  }

  async updateStatus(id: string, status: NewbieTask['status'], message?: string): Promise<void> {
    await this.store.transaction((current) => ({
      next: {
        items: (current.items ?? []).map((t) =>
          t.id === id ? { ...t, status, message: message ?? t.message, updated_at: Date.now() } : t
        ),
      },
    }))
  }

  async cancel(id: string): Promise<boolean> {
    let ok = false
    await this.store.transaction((current) => {
      const items = (current.items ?? []).map((t) => {
        if (t.id === id && ['pending', 'running'].includes(t.status)) {
          ok = true
          return { ...t, status: 'cancelling' as const, message: 'cancelling', updated_at: Date.now() }
        }
        return t
      })
      return { next: { items } }
    })
    return ok
  }

  async cancelRequested(id: string): Promise<boolean> {
    const task = await this.find(id)
    return task?.status === 'cancelling'
  }

  async delete(id: string): Promise<void> {
    await this.store.transaction((current) => ({
      next: { items: (current.items ?? []).filter((t) => t.id !== id) },
    }))
  }
}
