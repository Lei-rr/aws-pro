export type ApiResponse<T = unknown> = {
  code?: number
  message?: string
  data?: T
  [key: string]: unknown
}

export interface Account {
  id: string
  access_key?: string
  secret_key?: string
  secret_key_masked?: string
  remark?: string
  original_id?: string
  [key: string]: unknown
}

export interface AwsInstance {
  id?: string
  name?: string
  account_id?: string
  region?: string
  zone?: string
  state?: string
  public_ipv4?: string
  public_ipv6?: string
  public_ip?: string
  private_ip?: string
  ipv6?: string | string[]
  static_ip?: string | boolean | null
  remark?: string
  bundle_id?: string
  bundle_specs?: Record<string, number | string>
  instance_type?: string
  [key: string]: unknown
}

export interface NewbieTask {
  id: string
  account_id: string
  step: string
  step_label: string
  status: 'pending' | 'running' | 'cancelling' | 'completed' | 'cancelled' | 'failed'
  message?: string
  logs?: string[]
  log_start_seq?: number
  next_log_seq?: number
  operation_ids?: Record<string, string>
  resources?: Record<string, string>
  phase?: 'pending' | 'creating' | 'cleaning' | 'done'
  current_step?: string
  progress?: number
  created_at: number
  updated_at: number
}

export interface AppConfig {
  regions?: Record<string, string>
  ec2_regions?: Record<string, string>
  blueprints?: Record<string, string>
  [key: string]: unknown
}
