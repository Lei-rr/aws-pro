const ERROR_MESSAGE_MAP: Record<string, string> = {
  unauthenticated: '请先登录',
  invalid_credentials: '用户名或密码不正确',
  validation_failed: '参数校验未通过',
  not_found: '接口不存在',
  http_error: '请求失败',
  server_error: '服务内部错误',
  internal_error: '服务内部错误',
  request_error: '请求错误',
  validation_error: '参数校验失败',
  rate_limited: '请求过于频繁，请稍后再试',
  service_unavailable: '服务暂时不可用，请稍后重试',
  health_check_failed: '健康检查失败',

  account_not_found: '账号不存在',
  account_exists: '账号已存在',
  account_id_invalid: '账号 ID 无效',
  secret_key_required: 'Secret Key 不能为空',

  lightsail_instance_not_found: 'Lightsail 实例不存在',
  lightsail_action_invalid: 'Lightsail 操作无效',
  lightsail_action_confirm_required: '请确认 Lightsail 操作',
  lightsail_instance_name_invalid: 'Lightsail 实例名称无效',
  lightsail_bundle_invalid: 'Lightsail 套餐无效',
  lightsail_zone_invalid: 'Lightsail 可用区无效',

  ec2_instance_not_found: 'EC2 实例不存在',
  ec2_action_invalid: 'EC2 操作无效',
  ec2_action_confirm_required: '请确认 EC2 操作',
  ec2_instance_id_invalid: 'EC2 实例 ID 无效',
  ec2_ami_invalid: 'EC2 AMI 无效',
  ec2_instance_type_invalid: 'EC2 实例类型无效',

  region_not_configured: '区域未配置',
  region_invalid: '区域无效',

  newbie_task_running: '已有新手任务在执行',
  newbie_task_not_found: '新手任务不存在',
  newbie_task_cancel_invalid: '当前状态不可终止',
  newbie_task_id_invalid: '新手任务 ID 无效',
  newbie_task_step_invalid: '新手任务步骤无效',

  aws_request_failed: 'AWS 请求失败',
  aws_invalid_response: 'AWS 返回数据无效',
}

export function translateError(code: string, fallback?: string): string {
  return ERROR_MESSAGE_MAP[code] || fallback || code
}
