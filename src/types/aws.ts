export interface AwsAccount {
  id: string
  access_key: string
  secret_key: string
  remark?: string
  created_at?: number
  updated_at?: number
}

export interface PublicAwsAccount {
  id: string
  access_key: string
  has_secret_key: boolean
  secret_key_masked: string
  remark: string
}

export interface LightsailInstance {
  account_id: string
  region: string
  name: string
  state: string
  public_ip?: string
  static_ip?: string
  ipv6?: string
  zone?: string
  bundle_id?: string
  bundle_specs?: Record<string, unknown>
  remark?: string
}

export interface Ec2Instance {
  account_id: string
  region: string
  id: string
  name: string
  state: string
  public_ip?: string
  static_ip?: string
  ipv6?: string
  zone?: string
  instance_type?: string
  remark?: string
}

export interface NewbieTask {
  id: string
  account_id: string
  step: string
  step_label: string
  status: 'pending' | 'running' | 'cancelling' | 'completed' | 'cancelled' | 'failed'
  message?: string
  /** Persisted execution logs for poll / read-only SSE. */
  logs?: string[]
  operation_ids?: Record<string, string>
  created_at: number
  updated_at: number
}
