import * as crypto from 'node:crypto'
import { ApiError } from '../../shared/http/api-error.js'
import * as v from '../../shared/aws/aws-validator.js'
import { scalarString } from '../../shared/lib/scalar.js'
import type { AwsAccountLookup } from '../../shared/aws/account-lookup.js'
import { withAccountMutation } from '../../shared/aws/account-mutation.js'
import { NewbieTaskRepository } from './newbie.repository.js'
import { NewbieTaskRunner } from './newbie.runner.js'
import { NewbieTaskLeaseLostException } from './newbie-lease-lost.js'

export class NewbieTaskService {
  private readonly jobs = new Map<string, Promise<void>>()
  private closed = false

  constructor(
    private readonly accounts: AwsAccountLookup,
    private readonly tasks: NewbieTaskRepository,
    private readonly runner: NewbieTaskRunner
  ) {}

  /** Resume unfinished tasks after process restart (idempotent). */
  async resumeActiveJobs(): Promise<void> {
    await this.tasks.pruneFinished()
    const task = await this.tasks.findActive()
    if (task && (task.status === 'pending' || task.status === 'running' || task.status === 'cancelling')) {
      this.ensureBackground(task.id)
    }
  }

  async create(body: Record<string, unknown>) {
    if (this.closed) throw new ApiError('server_shutting_down', 'Server is shutting down', 503)
    v.required(body, ['account_id'])
    const accountId = v.accountId(scalarString(body.account_id))
    const step = this.step(scalarString(body.step, 'all'))
    const task = await withAccountMutation(accountId, async () => {
      await this.accounts.requireAccount(accountId)
      await this.tasks.pruneFinished()
      return this.tasks.create(accountId, step, this.runner.stepLabel(step))
    })
    if (!task) throw new ApiError('newbie_task_running', 'Another newbie task is running', 409)
    this.ensureBackground(task.id)
    return task
  }

  async find(id: string) {
    const task = await this.tasks.find(this.taskId(id))
    if (!task) throw new ApiError('newbie_task_not_found', 'Newbie task not found', 404, { task_id: id })
    if (task.status === 'pending' || task.status === 'running' || task.status === 'cancelling') {
      this.ensureBackground(task.id)
    }
    return task
  }

  async active() {
    await this.tasks.pruneFinished()
    const task = await this.tasks.findActive()
    if (task && (task.status === 'pending' || task.status === 'running' || task.status === 'cancelling')) {
      this.ensureBackground(task.id)
    }
    return task
  }

  async recent() {
    await this.tasks.pruneFinished()
    const active = await this.tasks.findActive()
    if (active) {
      this.ensureBackground(active.id)
      return active
    }
    return this.tasks.findRecent()
  }

  async assertAccountRemovable(accountId: string): Promise<void> {
    const active = await this.tasks.findActive()
    if (active?.account_id === accountId) {
      throw new ApiError('account_has_active_newbie_task', 'Account has an active newbie task', 409, {
        account_id: accountId,
        task_id: active.id,
      })
    }
  }

  async cancel(id: string) {
    id = this.taskId(id)
    const task = await this.find(id)
    if (!(await this.tasks.cancel(id))) {
      throw new ApiError('newbie_task_cancel_invalid', 'Newbie task cannot be cancelled', 409, { task_id: id })
    }
    await this.tasks.appendLog(id, '已收到终止请求，后台任务将尽快停止并清理临时资源...')
    this.ensureBackground(id)
    return (await this.tasks.find(id)) ?? task
  }

  /** Read-only SSE: tail persisted logs. Execution is independent of this connection. */
  async streamLogs(
    id: string,
    write: (message: string, seq: number) => void,
    options: { signal?: AbortSignal; afterSeq?: number } = {}
  ) {
    id = this.taskId(id)
    let cursorSeq = Math.max(0, Number(options.afterSeq ?? 0))
    this.ensureBackground(id)

    while (!options.signal?.aborted) {
      const task = await this.tasks.find(id)
      if (!task) {
        write('任务不存在或已清理。', cursorSeq + 1)
        return
      }

      const logs = task.logs ?? []
      const startSeq = Number(task.log_start_seq) > 0 ? Number(task.log_start_seq) : 1
      for (let index = Math.max(0, cursorSeq - startSeq + 1); index < logs.length; index++) {
        const seq = startSeq + index
        write(logs[index]!, seq)
        cursorSeq = seq
      }

      if (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') {
        return
      }

      await this.sleep(800)
    }
  }

  private ensureBackground(id: string) {
    if (this.closed) return
    if (this.jobs.has(id)) return
    const job = this.runInBackground(id)
      .catch(() => undefined)
      .finally(() => {
        this.jobs.delete(id)
      })
    this.jobs.set(id, job)
  }

  async close(): Promise<void> {
    this.closed = true
    while (this.jobs.size) {
      await Promise.allSettled(Array.from(this.jobs.values()))
    }
  }

  private async runInBackground(id: string) {
    const task = await this.tasks.find(id)
    if (!task) return

    if (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') {
      return
    }

    const workerToken = crypto.randomUUID()
    if (!(await this.tasks.claimForExecution(id, workerToken))) {
      setTimeout(() => this.ensureBackground(id), 10_000).unref()
      return
    }
    let leaseLost = false
    const heartbeat = setInterval(() => {
      void this.tasks.heartbeat(id, workerToken).catch(() => {
        leaseLost = true
      })
    }, 10_000)

    try {
      await this.runClaimedTask(id, task, workerToken, () => leaseLost)
    } finally {
      clearInterval(heartbeat)
    }
  }

  private async runClaimedTask(
    id: string,
    initialTask: NonNullable<Awaited<ReturnType<NewbieTaskRepository['find']>>>,
    workerToken: string,
    heartbeatLost: () => boolean
  ) {
    const wasPending = initialTask.status === 'pending'
    let task = (await this.tasks.find(id)) ?? initialTask

    if (task.status === 'cancelling') {
      if (Object.keys(task.resources ?? {}).length) {
        await this.resumeCleanup(id, task, workerToken)
      } else {
        await this.tasks.finalizeCleanup(
          id,
          workerToken,
          'cancelled',
          'cancelled before start',
          '任务已终止：终止请求已接受，任务未开始执行。'
        )
      }
      return
    }

    if (task.status === 'running' && task.phase === 'cleaning' && Object.keys(task.resources ?? {}).length) {
      await this.resumeCleanup(id, task, workerToken)
      return
    }

    if (wasPending) {
      await this.tasks.appendLog(id, `后台开始执行（账号: ${task.account_id}，范围: ${task.step_label}）`)
    } else if (task.status === 'running') {
      await this.tasks.appendLog(id, '后台执行器已接管运行中的任务。')
    }

    const currentTask = await this.tasks.find(id)
    if (!currentTask) return
    task = currentTask
    if (task.status === 'cancelling') {
      await this.tasks.finalizeCleanup(
        id,
        workerToken,
        'cancelled',
        'cancelled',
        '任务已终止：终止请求已接受，任务未继续执行。'
      )
      return
    }
    if (task.status !== 'running') return

    let logChain = Promise.resolve()
    try {
      const account = await this.accounts.requireAccount(task.account_id)
      const appendRunnerLog = (message: string, ...args: unknown[]) => {
        let i = 0
        const line = String(message).replace(/%s/g, () => String(args[i++] ?? ''))
        logChain = logChain.catch(() => undefined).then(() => this.tasks.appendLog(id, line, workerToken))
      }
      if (!(await this.tasks.ownsExecution(id, workerToken))) return
      const operationIds = await this.tasks.ensureOperationIds(id, workerToken)
      await this.runner.run(
        account,
        task.step,
        operationIds,
        appendRunnerLog,
        async () => {
          if (heartbeatLost() || !(await this.tasks.ownsExecution(id, workerToken))) {
            throw new NewbieTaskLeaseLostException()
          }
          return this.tasks.cancelRequested(id)
        },
        async (patch) => this.tasks.patchRuntime(id, patch, workerToken),
        async () => {
          if (heartbeatLost() || !(await this.tasks.ownsExecution(id, workerToken))) {
            throw new NewbieTaskLeaseLostException()
          }
        }
      )
      await logChain.catch(() => undefined)
      await this.tasks.completeUnlessCancelling(id, workerToken)
    } catch (error) {
      await logChain.catch(() => undefined)
      if (error instanceof NewbieTaskLeaseLostException) return
      const msg = error instanceof Error ? error.message : String(error)
      await this.tasks.failUnlessCancelling(id, msg, workerToken)
    }
  }

  private async resumeCleanup(
    id: string,
    task: NonNullable<Awaited<ReturnType<NewbieTaskRepository['find']>>>,
    workerToken: string
  ) {
    let logChain = Promise.resolve()
    const appendRunnerLog = (message: string, ...args: unknown[]) => {
      let i = 0
      const line = String(message).replace(/%s/g, () => String(args[i++] ?? ''))
      logChain = logChain.then(() => this.tasks.appendLog(id, line, workerToken))
    }
    try {
      const account = await this.accounts.requireAccount(task.account_id)
      if (!(await this.tasks.ownsExecution(id, workerToken))) return
      await this.tasks.patchRuntime(id, { phase: 'cleaning' }, workerToken)
      await this.tasks.appendLog(id, '后台恢复资源清理，不会重新创建资源。', workerToken)
      const assertOwnership = async () => {
        if (!(await this.tasks.ownsExecution(id, workerToken))) throw new NewbieTaskLeaseLostException()
      }
      await this.runner.cleanup(account, task.resources ?? {}, appendRunnerLog, assertOwnership)
      await logChain
      await assertOwnership()
      const cancelling = (await this.tasks.find(id))?.status === 'cancelling'
      await this.tasks.finalizeCleanup(
        id,
        workerToken,
        cancelling ? 'cancelled' : 'failed',
        cancelling ? 'cancelled after cleanup' : 'interrupted task cleanup completed',
        cancelling ? '任务已终止：临时资源清理完成。' : '任务中断：已恢复并清理临时资源，请重新执行。'
      )
    } catch (error) {
      await logChain.catch(() => undefined)
      if (error instanceof NewbieTaskLeaseLostException) return
      const msg = error instanceof Error ? error.message : String(error)
      await this.tasks
        .finalizeCleanup(id, workerToken, 'failed', msg, `任务失败：恢复清理失败：${msg}`)
        .catch((finalizeError) => {
          if (!(finalizeError instanceof NewbieTaskLeaseLostException)) throw finalizeError
        })
    }
  }

  private taskId(id: string) {
    const value = id.trim()
    if (!/^[a-f0-9]{16}$/.test(value)) throw new ApiError('newbie_task_id_invalid', 'Invalid newbie task id', 422)
    return value
  }

  private step(step: string) {
    const value = step.trim() || 'all'
    if (!this.runner.hasStep(value))
      throw new ApiError('newbie_task_step_invalid', 'Invalid newbie task step', 422, { step: value })
    return value
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
