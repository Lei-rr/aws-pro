import type { AppModules } from './create-modules.js'
import { AccountRemovalWorkflow } from '../workflows/account-management/account-removal.workflow.js'

export function createWorkflows(modules: AppModules) {
  return {
    accounts: {
      removal: new AccountRemovalWorkflow(
        modules.accounts.service,
        modules.lightsail.repository,
        modules.ec2.repository,
        modules.newbie.service
      ),
    },
  }
}

export type AppWorkflows = ReturnType<typeof createWorkflows>
