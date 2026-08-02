let defaultHttpTimeoutMs = 30_000

export function setDefaultHttpTimeout(ms: number): void {
  if (Number.isFinite(ms) && ms > 0) defaultHttpTimeoutMs = ms
}

export function getDefaultHttpTimeout(): number {
  return defaultHttpTimeoutMs
}
