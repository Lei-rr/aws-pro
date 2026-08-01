const chains = new Map<string, Promise<void>>()

/** Serialize local mutations that share one AWS account within this process. */
export function withAccountMutation<T>(accountId: string, operation: () => Promise<T>): Promise<T> {
  const key = accountId.trim()
  const previous = chains.get(key) ?? Promise.resolve()
  const result = previous.then(operation, operation)
  const settled = result.then(
    () => undefined,
    () => undefined
  )
  chains.set(key, settled)
  void settled.finally(() => {
    if (chains.get(key) === settled) chains.delete(key)
  })
  return result
}
