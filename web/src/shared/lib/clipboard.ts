import { toast } from '@/shared/lib/toast'

function legacyCopy(text: string) {
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  document.body.appendChild(textarea)
  textarea.select()
  try {
    return document.execCommand('copy')
  } finally {
    document.body.removeChild(textarea)
  }
}

export async function copyText(value: unknown, successText = '已复制') {
  const text = String(value || '')
  if (!text) {
    toast.warning('没有可复制的内容')
    return false
  }
  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text)
    else if (!legacyCopy(text)) throw new Error('legacy copy failed')
    toast.success(successText)
    return true
  } catch {
    toast.error('复制失败，请手动复制')
    return false
  }
}
