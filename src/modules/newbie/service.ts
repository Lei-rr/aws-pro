
import { ApiError } from '../../lib/http/api-error.js'
import * as v from '../../lib/utils/aws-validator.js'
import { AccountService } from '../account/service.js'
import { NewbieTaskCancelledException } from './cancelled.js'
import { NewbieTaskRepository } from './repository.js'
import { NewbieTaskRunner } from './runner.js'

export class NewbieTaskService {
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
    const task = await this.tasks.create(accountId, step, this.runner.stepLabel(step))
    if (!task) throw new ApiError('newbie_task_running', 'Another newbie task is running', 409)
    return task
  }

  async find(id: string) {
    const task = await this.tasks.find(this.taskId(id))
    if (!task) throw new ApiError('newbie_task_not_found', 'Newbie task not found', 404, { task_id: id })
    return task
  }

  async cancel(id: string) {
    id = this.taskId(id)
    const task = await this.find(id)
    if (!(await this.tasks.cancel(id))) {
      throw new ApiError('newbie_task_cancel_invalid', 'Newbie task cannot be cancelled', 409, { task_id: id })
    }
    return (await this.tasks.find(id)) ?? task
  }

  async runStream(id: string, emit: (message: string) => void) {
    const task = await this.find(id)
    if (task.status === 'cancelling') {
      emit('任务已终止：终止请求已接受，任务未开始执行。')
      await this.tasks.delete(task.id)
      return
    }
    if (task.status !== 'pending') {
      emit(`任务状态：${task.status}`)
      if (task.message) emit(task.message)
      return
    }
    const account = await this.accounts.requireAccount(task.account_id)
    await this.tasks.updateStatus(task.id, 'running', 'running')
    try {
      await this.runner.run(
        account,
        task.step,
        task.operation_ids ?? {},
        (message, ...args) => {
          let i = 0
          emit(String(message).replace(/%s/g, () => String(args[i++] ?? '')))
        },
        async () => this.tasks.cancelRequested(task.id),
      )
      emit('执行完毕，连接断开。')
    } catch (error) {
      if (error instanceof NewbieTaskCancelledException) emit(`任务已终止：${error.message}`)
      else emit(`任务失败：${error instanceof Error ? error.message : String(error)}`)
    } finally {
      await this.tasks.delete(task.id)
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
}
