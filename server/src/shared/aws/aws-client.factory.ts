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
  private readonly clientPool = new Map<string, unknown>()

  /** Evict cached SDK clients for a given account when credentials change or account is deleted. */
  evict(accountId: string): void {
    const prefix = `${accountId}:`
    for (const key of this.clientPool.keys()) {
      if (key.startsWith(prefix)) {
        const client = this.clientPool.get(key)
        if (client && typeof (client as { destroy?: () => void }).destroy === 'function') {
          try {
            ;(client as { destroy: () => void }).destroy()
          } catch {
            // ignore
          }
        }
        this.clientPool.delete(key)
      }
    }
  }

  private getOrCreate<T>(key: string, factory: () => T): T {
    let client = this.clientPool.get(key) as T | undefined
    if (!client) {
      client = factory()
      this.clientPool.set(key, client)
    }
    return client
  }

  lightsail(account: AwsAccount, region: string) {
    return this.getOrCreate(`${account.id}:lightsail:${region}`, () => new LightsailClient(base(account, region)))
  }
  ec2(account: AwsAccount, region: string) {
    return this.getOrCreate(`${account.id}:ec2:${region}`, () => new EC2Client(base(account, region)))
  }
  budgets(account: AwsAccount) {
    return this.getOrCreate(`${account.id}:budgets:us-east-1`, () => new BudgetsClient(base(account, 'us-east-1')))
  }
  iam(account: AwsAccount) {
    return this.getOrCreate(`${account.id}:iam:us-east-1`, () => new IAMClient(base(account, 'us-east-1')))
  }
  lambda(account: AwsAccount, region: string) {
    return this.getOrCreate(`${account.id}:lambda:${region}`, () => new LambdaClient(base(account, region)))
  }
  rds(account: AwsAccount, region: string) {
    return this.getOrCreate(`${account.id}:rds:${region}`, () => new RDSClient(base(account, region)))
  }
  sts(account: AwsAccount) {
    return this.getOrCreate(`${account.id}:sts:us-east-1`, () => new STSClient(base(account, 'us-east-1')))
  }
  costExplorer(account: AwsAccount) {
    return this.getOrCreate(
      `${account.id}:costExplorer:us-east-1`,
      () => new CostExplorerClient(base(account, 'us-east-1'))
    )
  }
  serviceQuotas(account: AwsAccount, region: string) {
    return this.getOrCreate(
      `${account.id}:serviceQuotas:${region}`,
      () => new ServiceQuotasClient(base(account, region))
    )
  }
  account(account: AwsAccount) {
    return this.getOrCreate(`${account.id}:account:us-east-1`, () => new AccountClient(base(account, 'us-east-1')))
  }
}
