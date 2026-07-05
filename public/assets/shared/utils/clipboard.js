import { message } from '../plugins/antDesignVue.js'

function legacyCopy(text) {
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  textarea.style.top = '0'
  document.body.appendChild(textarea)
  textarea.select()
  textarea.setSelectionRange(0, textarea.value.length)

  try {
    return document.execCommand('copy')
  } finally {
    document.body.removeChild(textarea)
  }
}

export async function copyText(value, successText = '已复制') {
  const text = String(value || '')
  if (!text) {
    message.warning('没有可复制的内容')
    return false
  }

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
    } else if (!legacyCopy(text)) {
      throw new Error('legacy copy failed')
    }
    message.success(successText)
    return true
  } catch (error) {
    message.error('复制失败，请手动复制')
    return false
  }
}
