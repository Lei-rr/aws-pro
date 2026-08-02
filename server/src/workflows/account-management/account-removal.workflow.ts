import { AccountService } from '../../modules/accounts/account.service.js'
import { Ec2InstanceRepository } from '../../modules/ec2/ec2.repository.js'
import { LightsailInstanceRepository } from '../../modules/lightsail/lightsail.repository.js'
import { NewbieTaskService } from '../../modules/newbie/newbie.service.js'
import { withAccountMutation } from '../../shared/aws/account-mutation.js'

/** Cross-module account removal with compensating instance-cache restore. */
export class AccountRemovalWorkflow {
  constructor(
    private readonly accounts: AccountService,
    private readonly lightsail: LightsailInstanceRepository,
    private readonly ec2: Ec2InstanceRepository,
    private readonly newbie: NewbieTaskService
  ) {}

  async delete(id: string): Promise<void> {
    await withAccountMutation(id, () =>
      this.accounts.runSerialMutation(async () => {
        await this.accounts.requireAccount(id)
        await this.newbie.assertAccountRemovable(id)
        const [lightsailSnapshot, ec2Snapshot] = await Promise.all([
          this.lightsail.itemsByAccount(id),
          this.ec2.itemsByAccount(id),
        ])
        try {
          await this.lightsail.deleteByAccount(id)
          await this.ec2.deleteByAccount(id)
          await this.accounts.deleteRecord(id)
        } catch (error) {
          await Promise.allSettled([
            this.lightsail.replaceAccount(id, lightsailSnapshot),
            this.ec2.replaceAccount(id, ec2Snapshot),
          ])
          throw error
        }
      })
    )
  }
}
