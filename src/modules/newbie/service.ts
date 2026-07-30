import * as crypto from 'node:crypto'
import { ApiError } from '../../lib/http/api-error.js'
import * as v from '../../lib/utils/aws-validator.js'
import { AccountService } from '../account/service.js'
import { NewbieTaskRepository } from './repository.js'
import { NewbieTaskRunner } from './runner.js'

export class NewbieTaskService {
  private readonly jobs = new Map<string, Promise<void>>()

  constructor(
    private readonly accounts: AccountService,
    private readonly tasks: NewbieTaskRepository,
    private readonly runner: NewbieTaskRunner,
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
    v.required(body, ['account_id'])
    const accountId = v.accountId(String(body.account_id))
    await this.accounts.requireAccount(accountId)
    const step = this.step(String(body.step ?? 'all'))
    await this.tasks.pruneFinished()
    const task = await this.tasks.create(accountId, step, this.runner.stepLabel(step))
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
    options: { signal?: AbortSignal; afterSeq?: number } = {},
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
    if (this.jobs.has(id)) return
    const job = this.runInBackground(id)
      .catch(() => undefined)
      .finally(() => {
        this.jobs.delete(id)
      })
    this.jobs.set(id, job)
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
    const heartbeat = setInterval(() => {
      void this.tasks.heartbeat(id, workerToken).catch(() => undefined)
    }, 10_000)

    try {
      await this.runClaimedTask(id, task)
    } finally {
      clearInterval(heartbeat)
    }
  }

  private async runClaimedTask(id: string, initialTask: NonNullable<Awaited<ReturnType<NewbieTaskRepository['find']>>>) {
    const wasPending = initialTask.status === 'pending'
    let task = (await this.tasks.find(id)) ?? initialTask

    if (task.status === 'cancelling') {
      if (Object.keys(task.resources ?? {}).length) {
        await this.resumeCleanup(id, task)
      } else {
        await this.tasks.appendLog(id, '任务已终止：终止请求已接受，任务未开始执行。')
        await this.tasks.updateStatus(id, 'cancelled', 'cancelled before start')
      }
      return
    }

    if (task.status === 'running' && task.phase === 'cleaning' && Object.keys(task.resources ?? {}).length) {
      await this.resumeCleanup(id, task)
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
      await this.tasks.appendLog(id, '任务已终止：终止请求已接受，任务未继续执行。')
      await this.tasks.updateStatus(id, 'cancelled', 'cancelled')
      return
    }
    if (task.status !== 'running') return

    let logChain = Promise.resolve()
    try {
      const account = await this.accounts.requireAccount(task.account_id)
      const appendRunnerLog = (message: string, ...args: unknown[]) => {
        let i = 0
        const line = String(message).replace(/%s/g, () => String(args[i++] ?? ''))
        logChain = logChain
          .catch(() => undefined)
          .then(() => this.tasks.appendLog(id, line))
      }
      const operationIds = await this.tasks.ensureOperationIds(id)
      await this.runner.run(
        account,
        task.step,
        operationIds,
        appendRunnerLog,
        async () => this.tasks.cancelRequested(id),
        async (patch) => this.tasks.patchRuntime(id, patch),
      )
      await logChain.catch(() => undefined)
      await this.tasks.completeUnlessCancelling(id)
    } catch (error) {
      await logChain.catch(() => undefined)
      const msg = error instanceof Error ? error.message : String(error)
      await this.tasks.failUnlessCancelling(id, msg)
    }
  }

  private async resumeCleanup(id: string, task: NonNullable<Awaited<ReturnType<NewbieTaskRepository['find']>>>) {
    let logChain = Promise.resolve()
    const appendRunnerLog = (message: string, ...args: unknown[]) => {
      let i = 0
      const line = String(message).replace(/%s/g, () => String(args[i++] ?? ''))
      logChain = logChain.then(() => this.tasks.appendLog(id, line))
    }
    try {
      const account = await this.accounts.requireAccount(task.account_id)
      await this.tasks.patchRuntime(id, { phase: 'cleaning' })
      await this.tasks.appendLog(id, '后台恢复资源清理，不会重新创建资源。')
      await this.runner.cleanup(account, task.resources ?? {}, appendRunnerLog)
      await logChain
      const cancelling = (await this.tasks.find(id))?.status === 'cancelling'
      await this.tasks.updateStatus(id, cancelling ? 'cancelled' : 'failed', cancelling ? 'cancelled after cleanup' : 'interrupted task cleanup completed')
      await this.tasks.patchRuntime(id, { phase: 'done' })
      await this.tasks.appendLog(
        id,
        cancelling ? '任务已终止：临时资源清理完成。' : '任务中断：已恢复并清理临时资源，请重新执行。',
      )
    } catch (error) {
      await logChain.catch(() => undefined)
      const msg = error instanceof Error ? error.message : String(error)
      await this.tasks.appendLog(id, `任务失败：恢复清理失败：${msg}`)
      await this.tasks.updateStatus(id, 'failed', msg)
    }
  }

  private taskId(id: string) {
    const value = id.trim()
    if (!/^[a-f0-9]{16}$/.test(value)) throw new ApiError('newbie_task_id_invalid', 'Invalid newbie task id', 422)
    return value
  }

  private step(step: string) {
    const value = step.trim() || 'all'
    if (!this.runner.hasStep(value)) throw new ApiError('newbie_task_step_invalid', 'Invalid newbie task step', 422, { step: value })
    return value
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
