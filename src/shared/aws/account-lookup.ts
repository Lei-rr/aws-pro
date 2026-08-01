import type { AwsAccount } from './aws.types.js'

export interface AwsAccountLookup {
  requireAccount(id: string): Promise<AwsAccount>
}
