export type AppConfigData = {
  regions: Record<string, string>
  ec2_regions: Record<string, string>
  blueprints: Record<string, string>
}

/**
 * Built-in panel defaults shipped with the code/image.
 * Not stored under data/ — data/ is only for runtime private state.
 */
export const BUILTIN_APP_CONFIG: AppConfigData = {
  regions: {
    'ap-east-1': '香港',
    'ap-northeast-1': '东京',
    'ap-northeast-2': '首尔',
    'ap-southeast-1': '新加坡',
    'ap-southeast-2': '悉尼',
    'ap-southeast-3': '雅加达',
    'ap-southeast-5': '马来西亚',
    'ap-south-1': '孟买',
    'eu-north-1': '斯德哥尔摩',
    'eu-central-1': '法兰克福',
    'eu-south-2': '西班牙',
    'eu-west-1': '爱尔兰',
    'eu-west-2': '伦敦',
    'eu-west-3': '巴黎',
    'us-east-1': '弗吉尼亚州',
    'us-east-2': '俄亥俄州',
    'us-west-2': '俄勒冈州',
    'ca-central-1': '蒙特利尔',
    'sa-east-1': '圣保罗',
  },
  ec2_regions: {
    'af-south-1': '开普敦',
    'ap-east-1': '香港',
    'ap-northeast-1': '东京',
    'ap-northeast-2': '首尔',
    'ap-northeast-3': '大阪',
    'ap-south-1': '孟买',
    'ap-south-2': '海得拉巴',
    'ap-southeast-1': '新加坡',
    'ap-southeast-2': '悉尼',
    'ap-southeast-3': '雅加达',
    'ap-southeast-4': '墨尔本',
    'ap-southeast-5': '马来西亚',
    'ca-central-1': '蒙特利尔',
    'ca-west-1': '卡尔加里',
    'eu-central-1': '法兰克福',
    'eu-central-2': '苏黎世',
    'eu-north-1': '斯德哥尔摩',
    'eu-south-1': '米兰',
    'eu-south-2': '西班牙',
    'eu-west-1': '爱尔兰',
    'eu-west-2': '伦敦',
    'eu-west-3': '巴黎',
    'il-central-1': '以色列',
    'me-central-1': '阿联酋',
    'me-south-1': '巴林',
    'sa-east-1': '圣保罗',
    'us-east-1': '弗吉尼亚州',
    'us-east-2': '俄亥俄州',
    'us-west-1': '北加州',
    'us-west-2': '俄勒冈州',
  },
  blueprints: {
    ubuntu_24_04: 'Ubuntu 24.04',
    ubuntu_22_04: 'Ubuntu 22.04',
    debian_12: 'Debian 12',
  },
}
