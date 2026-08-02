import type { NewbieTask } from '../../shared/aws/aws.types.js'

export type PublicNewbieTask = Pick<
  NewbieTask,
  | 'id'
  | 'account_id'
  | 'step'
  | 'step_label'
  | 'status'
  | 'message'
  | 'logs'
  | 'log_start_seq'
  | 'next_log_seq'
  | 'phase'
  | 'current_step'
  | 'progress'
  | 'created_at'
  | 'updated_at'
>

export function presentNewbieTask(task: NewbieTask | null): PublicNewbieTask | null {
  if (!task) return null
  const {
    id,
    account_id,
    step,
    step_label,
    status,
    message,
    logs,
    log_start_seq,
    next_log_seq,
    phase,
    current_step,
    progress,
    created_at,
    updated_at,
  } = task
  return {
    id,
    account_id,
    step,
    step_label,
    status,
    message,
    logs,
    log_start_seq,
    next_log_seq,
    phase,
    current_step,
    progress,
    created_at,
    updated_at,
  }
}
