import { LightsailClient } from '@aws-sdk/client-lightsail'
import { EC2Client } from '@aws-sdk/client-ec2'
import { STSClient } from '@aws-sdk/client-sts'
import { IAMClient } from '@aws-sdk/client-iam'
import { LambdaClient } from '@aws-sdk/client-lambda'
import { RDSClient } from '@aws-sdk/client-rds'
import { BudgetsClient } from '@aws-sdk/client-budgets'
import { CostExplorerClient } from '@aws-sdk/client-cost-explorer'
import { ServiceQuotasClient } from '@aws-sdk/client-service-quotas'
import { AccountClient } from '@aws-sdk/client-account'
import { NodeHttpHandler } from '@smithy/node-http-handler'
import { getDefaultHttpTimeout } from '../http/base.client.js'
import type { AwsAccount } from './aws.types.js'

function creds(account: AwsAccount) {
  return {
    accessKeyId: account.access_key,
    secretAccessKey: account.secret_key,
  }
}

function base(account: AwsAccount, region: string) {
  const timeout = getDefaultHttpTimeout()
  return {
    region,
    credentials: creds(account),
    maxAttempts: 3,
    requestHandler: new NodeHttpHandler({
      connectionTimeout: timeout,
      requestTimeout: timeout,
      socketTimeout: timeout,
      throwOnRequestTimeout: true,
    }),
  }
}

export class AwsClientFactory {
  lightsail(account: AwsAccount, region: string) {
    return new LightsailClient(base(account, region))
  }
  ec2(account: AwsAccount, region: string) {
    return new EC2Client(base(account, region))
  }
  budgets(account: AwsAccount) {
    return new BudgetsClient(base(account, 'us-east-1'))
  }
  iam(account: AwsAccount) {
    return new IAMClient(base(account, 'us-east-1'))
  }
  lambda(account: AwsAccount, region: string) {
    return new LambdaClient(base(account, region))
  }
  rds(account: AwsAccount, region: string) {
    return new RDSClient(base(account, region))
  }
  sts(account: AwsAccount) {
    return new STSClient(base(account, 'us-east-1'))
  }
  costExplorer(account: AwsAccount) {
    return new CostExplorerClient(base(account, 'us-east-1'))
  }
  serviceQuotas(account: AwsAccount, region: string) {
    return new ServiceQuotasClient(base(account, region))
  }
  account(account: AwsAccount) {
    return new AccountClient(base(account, 'us-east-1'))
  }
}
