export function maskSecret(value: string): string {
  const text = value.trim()
  if (text === '') return ''
  if (text.length <= 8) return '*'.repeat(text.length)
  return `${text.slice(0, 4)}${'*'.repeat(Math.max(4, text.length - 8))}${text.slice(-4)}`
}
