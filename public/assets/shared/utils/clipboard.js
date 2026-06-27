import { message } from '../plugins/antDesignVue.js'

export async function copyText(value, successText = '已复制') {
  const text = String(value || '')
  if (!text) {
    message.warning('没有可复制的内容')
    return false
  }

  try {
    await navigator.clipboard.writeText(text)
    message.success(successText)
    return true
  } catch (error) {
    message.error('复制失败，请手动复制')
    return false
  }
}
