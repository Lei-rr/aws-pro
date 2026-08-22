import type { AppContext } from './create-context.js'

export async function startContext(ctx: AppContext): Promise<void> {
  await ctx.modules.newbie.service.resumeActiveJobs()

  if (await ctx.modules.auth.session.isDefaultCredential()) {
    console.warn(
      '\x1b[33m[SECURITY WARNING] 当前仍在运行默认账号密码 (admin/admin)，公网部署请及时修改 data/config.json\x1b[0m'
    )
  }
}
