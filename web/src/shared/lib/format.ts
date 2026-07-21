export function regionName(regions: Record<string, string> | null | undefined, id?: string | null) {
  if (!id) return '-'
  return (regions && regions[id]) || id
}

export function formatNumber(value: unknown) {
  const n = Number(value || 0)
  return Number.isInteger(n) ? String(n) : String(n)
}
