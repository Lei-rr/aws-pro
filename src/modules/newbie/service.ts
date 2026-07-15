import { ApiError } from '../../lib/http/api-error.js'
import * as v from '../../lib/utils/aws-validator.js'
import { AccountService } from '../account/service.js'
import { NewbieTaskCancelledException } from './cancelled.js'
import { NewbieTaskRepository } from './repository.js'
import { NewbieTaskRunner } from './runner.js'

export class NewbieTaskService {
  private readonly jobs = new Map<string, Promise<void>>()

  constructor(
    private readonly accounts = new AccountService(),
    private readonly tasks = new NewbieTaskRepository(),
    private readonly runner = new NewbieTaskRunner(),
  ) {}

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
  async streamLogs(id: string, write: (message: string) => void, options: { signal?: AbortSignal } = {}) {
    id = this.taskId(id)
    let cursor = 0
    this.ensureBackground(id)

    while (!options.signal?.aborted) {
      const task = await this.tasks.find(id)
      if (!task) {
        write('任务不存在或已清理。')
        return
      }

      const logs = task.logs ?? []
      while (cursor < logs.length) {
        write(logs[cursor]!)
        cursor += 1
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
    let task = await this.tasks.find(id)
    if (!task) return

    if (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') {
      return
    }

    if (task.status === 'cancelling') {
      await this.tasks.appendLog(id, '任务已终止：终止请求已接受，任务未开始执行。')
      await this.tasks.updateStatus(id, 'cancelled', 'cancelled before start')
      return
    }

    if (task.status === 'pending') {
      await this.tasks.updateStatus(id, 'running', 'running')
      await this.tasks.appendLog(id, `后台开始执行（账号: ${task.account_id}，范围: ${task.step_label}）`)
    } else if (task.status === 'running') {
      await this.tasks.appendLog(id, '后台执行器已接管运行中的任务。')
    }

    task = await this.tasks.find(id)
    if (!task) return
    if (task.status === 'cancelling') {
      await this.tasks.appendLog(id, '任务已终止：终止请求已接受，任务未继续执行。')
      await this.tasks.updateStatus(id, 'cancelled', 'cancelled')
      return
    }
    if (task.status !== 'running') return

    const account = await this.accounts.requireAccount(task.account_id)
    try {
      await this.runner.run(
        account,
        task.step,
        task.operation_ids ?? {},
        (message, ...args) => {
          let i = 0
          const line = String(message).replace(/%s/g, () => String(args[i++] ?? ''))
          void this.tasks.appendLog(id, line)
        },
        async () => this.tasks.cancelRequested(id),
      )
      await this.tasks.appendLog(id, '执行完毕，连接断开。')
      await this.tasks.updateStatus(id, 'completed', 'completed')
    } catch (error) {
      if (error instanceof NewbieTaskCancelledException) {
        await this.tasks.appendLog(id, `任务已终止：${error.message}`)
        await this.tasks.updateStatus(id, 'cancelled', error.message)
      } else {
        const msg = error instanceof Error ? error.message : String(error)
        await this.tasks.appendLog(id, `任务失败：${msg}`)
        await this.tasks.updateStatus(id, 'failed', msg)
      }
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
