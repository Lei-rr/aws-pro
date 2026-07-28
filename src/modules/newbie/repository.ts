import * as crypto from 'node:crypto'
import { JsonStore } from '../../lib/storage/json-store.js'
import type { NewbieTask } from '../../types/aws.js'

type StoreShape = { items: NewbieTask[] }

const ACTIVE = new Set(['pending', 'running', 'cancelling'])

export class NewbieTaskRepository {
  constructor(private readonly store: JsonStore<StoreShape>) {}

  async all(): Promise<NewbieTask[]> {
    const data = await this.store.read()
    return data.items ?? []
  }

  async find(id: string): Promise<NewbieTask | null> {
    return (await this.all()).find((t) => t.id === id) ?? null
  }

  async findActive(): Promise<NewbieTask | null> {
    return (
      (await this.all()).find((t) => t.status === 'pending' || t.status === 'running' || t.status === 'cancelling') ??
      null
    )
  }

  async create(accountId: string, step: string, stepLabel: string): Promise<NewbieTask | null> {
    const now = Date.now()
    let created: NewbieTask | null = null
    await this.store.transaction((current) => {
      const items = current.items ?? []
      if (items.some((t) => ACTIVE.has(t.status))) {
        return { next: current }
      }
      created = {
        id: crypto.randomBytes(8).toString('hex'),
        account_id: accountId,
        step,
        step_label: stepLabel,
        status: 'pending',
        message: 'pending',
        logs: ['任务已创建，等待后台执行...'],
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
          t.id === id
            ? {
                ...t,
                status,
                message: message ?? t.message,
                updated_at: Date.now(),
              }
            : t,
        ),
      },
    }))
  }

  async appendLog(id: string, line: string): Promise<void> {
    const text = String(line || '').trimEnd()
    if (!text) return
    await this.store.transaction((current) => ({
      next: {
        items: (current.items ?? []).map((t) => {
          if (t.id !== id) return t
          const logs = [...(t.logs ?? []), text].slice(-2000)
          return {
            ...t,
            logs,
            message: text.slice(0, 240),
            updated_at: Date.now(),
          }
        }),
      },
    }))
  }

  async cancel(id: string): Promise<boolean> {
    let ok = false
    await this.store.transaction((current) => {
      const items = (current.items ?? []).map((t) => {
        if (t.id === id && (t.status === 'pending' || t.status === 'running')) {
          ok = true
          return {
            ...t,
            status: 'cancelling' as const,
            message: 'cancelling',
            updated_at: Date.now(),
          }
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

  /** Keep finished tasks briefly for log polling; drop older terminal tasks. */
  async pruneFinished(keepMs = 6 * 60 * 60 * 1000): Promise<void> {
    const cutoff = Date.now() - keepMs
    await this.store.transaction((current) => ({
      next: {
        items: (current.items ?? []).filter((t) => {
          if (ACTIVE.has(t.status)) return true
          return (t.updated_at || 0) >= cutoff
        }),
      },
    }))
  }
}
