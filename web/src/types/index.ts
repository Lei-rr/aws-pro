
export interface ApiSuccessResponse<T = unknown> {
  code: 0
  message: 'success'
  data: T
  meta?: Record<string, unknown>
  [key: string]: unknown
}
export type ApiResponse<T = unknown> = ApiSuccessResponse<T>
export interface ListResponse<T> { items: T[]; meta?: Record<string, unknown>; [key: string]: unknown }

export interface AwsAccount {
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
  remark?: string
  [key: string]: unknown
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
  [key: string]: unknown
}
