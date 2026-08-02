import type { AppContext } from './create-context.js'

export async function startContext(ctx: AppContext): Promise<void> {
  await ctx.modules.newbie.service.resumeActiveJobs()
}
