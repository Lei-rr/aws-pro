export function regionName(regions: Record<string, string> | null | undefined, id?: string | null) {
  if (!id) return '-'
  return (regions && regions[id]) || id
}
