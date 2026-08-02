export function createPlatform() {
  return {}
}

export type AppPlatform = ReturnType<typeof createPlatform>
