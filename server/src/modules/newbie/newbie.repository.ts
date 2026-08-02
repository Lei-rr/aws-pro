import * as crypto from 'node:crypto'
import { JsonStore } from '../../platform/storage/json-store.js'
import type { NewbieTask } from '../../shared/aws/aws.types.js'
import { NewbieTaskLeaseLostException } from './newbie-lease-lost.js'

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

  async findRecent(): Promise<NewbieTask | null> {
    const items = await this.all()
    return [...items].sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0))[0] ?? null
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
        log_start_seq: 1,
        next_log_seq: 2,
        operation_ids: {
          budget: crypto.randomUUID(),
          ec2: crypto.randomUUID(),
          lambda: crypto.randomUUID(),
          rds: crypto.randomUUID(),
        },
        resources: {},
        phase: 'pending',
        progress: 0,
        created_at: now,
        updated_at: now,
      }
      return { next: { items: [...items, created] } }
    })
    return created
  }

  async completeUnlessCancelling(id: string, workerToken: string): Promise<'completed' | 'cancelled' | null> {
    let outcome: 'completed' | 'cancelled' = 'completed'
    let updated = false
    await this.store.transaction((current) => ({
      next: {
        items: (current.items ?? []).map((task) => {
          if (!this.isOwner(task, id, workerToken)) return task
          updated = true
          const cancelling = task.status === 'cancelling'
          outcome = cancelling ? 'cancelled' : 'completed'
          const finalLine = cancelling ? '任务已终止：终止请求已接受。' : '执行完毕，连接断开。'
          const previous = task.logs ?? []
          const logs = [...previous, finalLine].slice(-2000)
          const dropped = Math.max(0, previous.length + 1 - logs.length)
          return {
            ...task,
            status: outcome,
            message: outcome,
            phase: 'done' as const,
            progress: outcome === 'completed' ? 100 : task.progress,
            logs,
            log_start_seq: this.logStartSeq(task) + dropped,
            next_log_seq: this.nextLogSeq(task) + 1,
            worker_token: undefined,
            worker_lease_until: undefined,
            updated_at: Date.now(),
          }
        }),
      },
    }))
    return updated ? outcome : null
  }

  async claimForExecution(id: string, workerToken: string, leaseMs = 30_000): Promise<boolean> {
    let claimed = false
    const now = Date.now()
    await this.store.transaction((current) => ({
      next: {
        items: (current.items ?? []).map((task) => {
          if (task.id !== id || !ACTIVE.has(task.status)) return task
          const ownerActive = Boolean(
            task.worker_token && task.worker_token !== workerToken && Number(task.worker_lease_until) > now
          )
          if (ownerActive) return task
          claimed = true
          return {
            ...task,
            status: task.status === 'pending' ? ('running' as const) : task.status,
            message: task.status === 'pending' ? 'running' : task.message,
            worker_token: workerToken,
            worker_lease_until: now + leaseMs,
            updated_at: now,
          }
        }),
      },
    }))
    return claimed
  }

  async heartbeat(id: string, workerToken: string, leaseMs = 30_000): Promise<void> {
    let updated = false
    await this.store.transaction((current) => ({
      next: {
        items: (current.items ?? []).map((task) => {
          if (!this.isOwner(task, id, workerToken)) return task
          updated = true
          return { ...task, worker_lease_until: Date.now() + leaseMs }
        }),
      },
    }))
    if (!updated) throw new NewbieTaskLeaseLostException()
  }

  async ownsExecution(id: string, workerToken: string): Promise<boolean> {
    const task = await this.find(id)
    return task?.worker_token === workerToken && ACTIVE.has(task.status) && Number(task.worker_lease_until) > Date.now()
  }

  async finalizeCleanup(
    id: string,
    workerToken: string,
    outcome: 'cancelled' | 'failed',
    message: string,
    finalLine: string
  ): Promise<void> {
    let updated = false
    await this.store.transaction((current) => ({
      next: {
        items: (current.items ?? []).map((task) => {
          if (
            task.id !== id ||
            task.worker_token !== workerToken ||
            !ACTIVE.has(task.status) ||
            Number(task.worker_lease_until) <= Date.now()
          ) {
            return task
          }
          updated = true
          const previous = task.logs ?? []
          const logs = [...previous, finalLine].slice(-2000)
          const dropped = Math.max(0, previous.length + 1 - logs.length)
          return {
            ...task,
            status: outcome,
            message,
            phase: 'done' as const,
            logs,
            log_start_seq: this.logStartSeq(task) + dropped,
            next_log_seq: this.nextLogSeq(task) + 1,
            worker_token: undefined,
            worker_lease_until: undefined,
            updated_at: Date.now(),
          }
        }),
      },
    }))
    if (!updated) throw new NewbieTaskLeaseLostException()
  }

  async ensureOperationIds(id: string, workerToken: string): Promise<Record<string, string>> {
    const generated = {
      budget: crypto.randomUUID(),
      ec2: crypto.randomUUID(),
      lambda: crypto.randomUUID(),
      rds: crypto.randomUUID(),
    }
    let result: Record<string, string> | null = null
    await this.store.transaction((current) => {
      const items = (current.items ?? []).map((task) => {
        if (!this.isOwner(task, id, workerToken)) return task
        result = { ...generated, ...(task.operation_ids ?? {}) }
        return { ...task, operation_ids: result, updated_at: Date.now() }
      })
      return { next: { items } }
    })
    if (!result) throw new NewbieTaskLeaseLostException()
    return result
  }

  async failUnlessCancelling(
    id: string,
    message: string,
    workerToken: string
  ): Promise<'failed' | 'cancelled' | 'retained' | null> {
    let outcome: 'failed' | 'cancelled' | 'retained' = 'failed'
    let updated = false
    await this.store.transaction((current) => ({
      next: {
        items: (current.items ?? []).map((task) => {
          if (!this.isOwner(task, id, workerToken)) return task
          updated = true
          const cancelling = task.status === 'cancelling'
          const hasResources = Object.keys(task.resources ?? {}).length > 0
          if (hasResources) {
            // Resources were checkpointed but cleanup is not guaranteed: keep the task
            // resumable so a later worker (restart or poll) retries cleanup.
            outcome = 'retained'
            const finalLine = `资源清理尚未完成：${message}。系统将自动重试清理。`
            const previous = task.logs ?? []
            const logs = [...previous, finalLine].slice(-2000)
            return {
              ...task,
              status: (cancelling ? 'cancelling' : 'running') as 'cancelling' | 'running',
              message: finalLine.slice(0, 240),
              phase: 'cleaning' as const,
              logs,
              log_start_seq: this.logStartSeq(task) + Math.max(0, previous.length + 1 - logs.length),
              next_log_seq: this.nextLogSeq(task) + 1,
              worker_token: undefined,
              worker_lease_until: undefined,
              updated_at: Date.now(),
            }
          }
          outcome = cancelling ? 'cancelled' : 'failed'
          const finalLine = cancelling ? '任务已终止：终止请求已接受。' : `任务失败：${message}`
          const previous = task.logs ?? []
          const logs = [...previous, finalLine].slice(-2000)
          return {
            ...task,
            status: outcome,
            message,
            phase: 'done' as const,
            logs,
            log_start_seq: this.logStartSeq(task) + Math.max(0, previous.length + 1 - logs.length),
            next_log_seq: this.nextLogSeq(task) + 1,
            worker_token: undefined,
            worker_lease_until: undefined,
            updated_at: Date.now(),
          }
        }),
      },
    }))
    return updated ? outcome : null
  }

  /** Keep a task with persisted resources active for a later cleanup retry. */
  async retainCleanupPending(id: string, message: string, workerToken: string): Promise<void> {
    let updated = false
    await this.store.transaction((current) => ({
      next: {
        items: (current.items ?? []).map((task) => {
          if (!this.isOwner(task, id, workerToken)) return task
          updated = true
          const finalLine = `资源清理失败，将自动重试：${message}`
          const previous = task.logs ?? []
          const logs = [...previous, finalLine].slice(-2000)
          return {
            ...task,
            status: (task.status === 'cancelling' ? 'cancelling' : 'running') as 'cancelling' | 'running',
            message: finalLine.slice(0, 240),
            phase: 'cleaning' as const,
            logs,
            log_start_seq: this.logStartSeq(task) + Math.max(0, previous.length + 1 - logs.length),
            next_log_seq: this.nextLogSeq(task) + 1,
            worker_token: undefined,
            worker_lease_until: undefined,
            updated_at: Date.now(),
          }
        }),
      },
    }))
    if (!updated) throw new NewbieTaskLeaseLostException()
  }

  async updateStatus(id: string, status: NewbieTask['status'], message?: string, workerToken?: string): Promise<void> {
    await this.store.transaction((current) => ({
      next: {
        items: (current.items ?? []).map((t) =>
          t.id === id && (!workerToken || t.worker_token === workerToken)
            ? {
                ...t,
                status,
                message: message ?? t.message,
                updated_at: Date.now(),
              }
            : t
        ),
      },
    }))
  }

  async appendLog(id: string, line: string, workerToken?: string): Promise<void> {
    const text = String(line || '').trimEnd()
    if (!text) return
    let updated = false
    await this.store.transaction((current) => ({
      next: {
        items: (current.items ?? []).map((t) => {
          if (t.id !== id || (workerToken && !this.isOwner(t, id, workerToken))) return t
          updated = true
          const previous = t.logs ?? []
          const logs = [...previous, text].slice(-2000)
          const dropped = Math.max(0, previous.length + 1 - logs.length)
          return {
            ...t,
            logs,
            log_start_seq: this.logStartSeq(t) + dropped,
            next_log_seq: this.nextLogSeq(t) + 1,
            message: text.slice(0, 240),
            updated_at: Date.now(),
          }
        }),
      },
    }))
    if (workerToken && !updated) throw new NewbieTaskLeaseLostException()
  }

  async patchRuntime(
    id: string,
    patch: Partial<Pick<NewbieTask, 'resources' | 'phase' | 'current_step' | 'progress'>>,
    workerToken?: string
  ): Promise<void> {
    let updated = false
    await this.store.transaction((current) => ({
      next: {
        items: (current.items ?? []).map((task) => {
          if (task.id !== id || (workerToken && !this.isOwner(task, id, workerToken))) return task
          updated = true
          return {
            ...task,
            ...patch,
            resources: patch.resources ? { ...(task.resources ?? {}), ...patch.resources } : task.resources,
            progress: patch.progress == null ? task.progress : Math.max(0, Math.min(100, patch.progress)),
            updated_at: Date.now(),
          }
        }),
      },
    }))
    if (workerToken && !updated) throw new NewbieTaskLeaseLostException()
  }

  private logStartSeq(task: NewbieTask): number {
    return Number(task.log_start_seq) > 0 ? Number(task.log_start_seq) : 1
  }

  private nextLogSeq(task: NewbieTask): number {
    return Number(task.next_log_seq) > 0 ? Number(task.next_log_seq) : this.logStartSeq(task) + (task.logs?.length ?? 0)
  }

  private isOwner(task: NewbieTask, id: string, workerToken: string): boolean {
    return (
      task.id === id &&
      task.worker_token === workerToken &&
      ACTIVE.has(task.status) &&
      Number(task.worker_lease_until) > Date.now()
    )
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
