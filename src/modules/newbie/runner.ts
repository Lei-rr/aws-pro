
import * as crypto from 'node:crypto'
import { CreateBudgetCommand, DescribeBudgetCommand } from '@aws-sdk/client-budgets'
import {
  DescribeImagesCommand,
  DescribeInstancesCommand,
  RunInstancesCommand,
  TerminateInstancesCommand,
} from '@aws-sdk/client-ec2'
import { CreateRoleCommand, DeleteRoleCommand, GetRoleCommand } from '@aws-sdk/client-iam'
import {
  CreateFunctionCommand,
  DeleteFunctionCommand,
  GetFunctionCommand,
} from '@aws-sdk/client-lambda'
import {
  CreateDBInstanceCommand,
  DeleteDBInstanceCommand,
  DescribeDBInstancesCommand,
} from '@aws-sdk/client-rds'
import { GetCallerIdentityCommand } from '@aws-sdk/client-sts'
import type { AwsAccount } from '../../types/aws.js'
import { AwsClientFactory } from '../../lib/aws/client-factory.js'
import { withAwsRetry } from '../../lib/aws/retry.js'
import { NewbieTaskCancelledException } from './cancelled.js'

type LogFn = (message: string, ...args: any[]) => void
type CancelFn = () => boolean | Promise<boolean>

const REGION = 'us-east-1'
/** 状态/重试轮询间隔（用户约定 3s） */
const POLL_MS = 3000
const STEPS: Record<string, string> = {
  all: '全部任务',
  budget: '设置 AWS Cost Budget',
  ec2: '创建并终止 EC2 实例（不等 running）',
  lambda: '创建并清理 Lambda 函数',
  rds: '创建并清理 RDS 数据库（不等 available）',
}

function fmt(message: string, args: any[]) {
  let i = 0
  return message.replace(/%s/g, () => String(args[i++] ?? ''))
}

export class NewbieTaskRunner {
  constructor(private readonly clients: AwsClientFactory) {}

  hasStep(step: string) {
    return Boolean(STEPS[step])
  }

  stepLabel(step: string) {
    return STEPS[step] ?? step
  }

  async run(account: AwsAccount, step: string, operationIds: Record<string, string>, log: LogFn, cancelled: CancelFn = async () => false) {
    // Local panel account id may be an email/alias. Budgets API requires the real 12-digit AWS AccountId.
    const accountId = await this.resolveAwsAccountId(account)
    log('====== 自动执行 AWS 新手任务 ======')
    log(fmt('区域：固定使用 %s，账户 ID：%s（本地账号：%s）', [REGION, accountId, account.id]))
    log(fmt('执行范围：%s', [this.stepLabel(step)]))

    const steps: Array<[string, string, string, () => Promise<void>]> = [
      ['budget', '任务 1/4', STEPS.budget, () => this.taskBudget(account, accountId, this.operationId(operationIds, 'budget'), log, cancelled)],
      ['ec2', '任务 2/4', STEPS.ec2, () => this.taskEc2(account, this.operationId(operationIds, 'ec2'), log, cancelled)],
      ['lambda', '任务 3/4', STEPS.lambda, () => this.taskLambda(account, this.operationId(operationIds, 'lambda'), log, cancelled)],
      ['rds', '任务 4/4', STEPS.rds, () => this.taskRds(account, this.operationId(operationIds, 'rds'), log, cancelled)],
    ]

    for (const [key, index, title, callback] of steps) {
      if (step !== 'all' && step !== key) continue
      await this.ensureNotCancelled(cancelled)
      await this.runStep(log, index, title, callback)
    }
    log('====== 已选择流程执行完毕 ======')
  }

  private async runStep(log: LogFn, index: string, title: string, callback: () => Promise<void>) {
    log('')
    log(fmt('[%s] %s...', [index, title]))
    try {
      await callback()
      log(fmt('完成：%s', [title]))
    } catch (error) {
      if (error instanceof NewbieTaskCancelledException) {
        log(fmt('已终止：%s', [title]))
        throw error
      }
      log(fmt('失败：%s', [error instanceof Error ? error.message : String(error)]))
      throw error
    }
  }

  private async taskBudget(account: AwsAccount, accountId: string, operationId: string, log: LogFn, cancelled: CancelFn) {
    await this.ensureNotCancelled(cancelled)
    const name = `AutoBudget-${this.shortId(operationId, 12)}`
    const email = `alert-${this.shortId(operationId, 8)}@gmail.com`
    const budgets = this.clients.budgets(account)
    try {
      await withAwsRetry('create newbie budget', () =>
        budgets.send(
          new CreateBudgetCommand({
            AccountId: accountId,
            Budget: {
              BudgetName: name,
              BudgetType: 'COST',
              TimeUnit: 'MONTHLY',
              BudgetLimit: { Amount: '10.0', Unit: 'USD' },
            },
            NotificationsWithSubscribers: [
              {
                Notification: {
                  NotificationType: 'ACTUAL',
                  ComparisonOperator: 'GREATER_THAN',
                  Threshold: 80,
                },
                Subscribers: [{ SubscriptionType: 'EMAIL', Address: email }],
              },
            ],
          }),
        ),
      )
    } catch (error) {
      if (!(await this.budgetExists(budgets, accountId, name))) throw error
      log(fmt('预算 %s 已存在，跳过创建。', [name]))
      return
    }
    log(fmt('预算 %s 创建成功，订阅邮箱：%s', [name, email]))
  }

  private async taskEc2(account: AwsAccount, operationId: string, log: LogFn, cancelled: CancelFn) {
    await this.ensureNotCancelled(cancelled)
    const client = this.clients.ec2(account, REGION)
    const ami = await this.latestAmazonLinuxAmi(client)
    const name = `AutoEC2-${this.shortId(operationId, 12)}`
    let id = ''
    try {
      try {
        const result = await withAwsRetry('run newbie EC2 instance', () =>
          client.send(
            new RunInstancesCommand({
              ImageId: ami,
              InstanceType: 't3.micro',
              MinCount: 1,
              MaxCount: 1,
              ClientToken: operationId,
              TagSpecifications: [{ ResourceType: 'instance', Tags: [{ Key: 'Name', Value: name }] }],
            }),
          ),
        )
        id = String(result?.Instances?.[0]?.InstanceId ?? '')
      } catch (error) {
        id = await this.findEc2InstanceByName(client, name)
        if (!id) throw error
        log(fmt('实例 %s 已存在，继续。', [id]))
      }
      if (!id) id = await this.findEc2InstanceByName(client, name)
      if (!id) throw new Error('EC2 RunInstances returned empty instance id')

      // 产品约定：拿到 instance id = 启动任务达成，不等 running（pending 可能要几分钟）
      try {
        const state = await this.ec2State(client, id)
        log(fmt('实例 %s 启动请求已成功，当前状态：%s（不等 running，直接终止清理）', [id, state || 'unknown']))
      } catch {
        log(fmt('实例 %s 启动请求已成功（查询状态暂不可用，直接终止清理）', [id]))
      }
      log('EC2 启动任务达成')
    } finally {
      if (id) await this.terminateEc2Instance(client, id, log)
    }
  }

  private async taskLambda(account: AwsAccount, operationId: string, log: LogFn, cancelled: CancelFn) {
    await this.ensureNotCancelled(cancelled)
    const iam = this.clients.iam(account)
    const lambda = this.clients.lambda(account, REGION)
    const roleName = `AutoLambdaRole-${this.shortId(operationId, 10)}`
    const functionName = `AutoFunc-${this.shortId(operationId, 10)}`
    try {
      const role = await this.createOrGetRole(iam, roleName)
      const roleArn = String((role as any)?.Role?.Arn ?? '')
      if (!roleArn) throw new Error('IAM role ARN empty after create/get')
      log(fmt('临时 IAM 角色 %s 创建成功，CreateFunction 将短重试等待传播（每 %ss）', [roleName, String(POLL_MS / 1000)]))
      await this.ensureNotCancelled(cancelled)
      // CreateFunction 成功 = 任务达成；不空等 Active / 不强依赖 Invoke
      await this.createLambdaFunction(lambda, functionName, roleArn, log, cancelled)
      try {
        const fn = await withAwsRetry('get newbie Lambda function state', () =>
          lambda.send(new GetFunctionCommand({ FunctionName: functionName })),
        )
        const state = String(fn?.Configuration?.State ?? '')
        log(fmt('函数 %s 创建请求已成功，当前状态：%s（不等 Active，直接清理）', [functionName, state || 'unknown']))
      } catch {
        log(fmt('函数 %s 创建请求已成功（查询状态暂不可用，直接清理）', [functionName]))
      }
      log('Lambda 创建任务达成')
    } finally {
      await this.deleteLambdaFunction(lambda, functionName, log)
      await this.sleep(POLL_MS)
      try {
        await this.deleteIamRole(iam, roleName, log)
      } catch (error) {
        log(fmt('IAM 角色 %s 删除失败，请到控制台确认：%s', [roleName, error instanceof Error ? error.message : String(error)]))
      }
    }
  }

  private async taskRds(account: AwsAccount, operationId: string, log: LogFn, cancelled: CancelFn) {
    await this.ensureNotCancelled(cancelled)
    const rds = this.clients.rds(account, REGION)
    const dbName = `db-${this.shortId(operationId, 12)}`
    let created = false
    try {
      try {
        const result = await withAwsRetry('create newbie RDS instance', () =>
          rds.send(
            new CreateDBInstanceCommand({
              DBInstanceIdentifier: dbName,
              DBInstanceClass: 'db.t3.micro',
              Engine: 'mysql',
              MasterUsername: 'admin',
              MasterUserPassword: 'Password123456',
              AllocatedStorage: 20,
              BackupRetentionPeriod: 0,
            }),
          ),
        )
        if (!result?.DBInstance?.DBInstanceIdentifier) throw new Error('RDS CreateDBInstance returned empty instance id')
      } catch (error) {
        if (!(await this.rdsExists(rds, dbName))) throw error
        log(fmt('数据库 %s 已存在，继续清理。', [dbName]))
      }
      created = true
      // 产品约定：CreateDBInstance 成功 / 实例已出现 = 任务达成。
      // 不等 available（creating 可能 10+ 分钟），立刻进入清理。
      try {
        const status = await this.rdsStatus(rds, dbName)
        log(fmt('数据库 %s 创建请求已成功，当前状态：%s（不等 available，直接清理）', [dbName, status || 'unknown']))
      } catch {
        log(fmt('数据库 %s 创建请求已成功（查询状态暂不可用，直接清理）', [dbName]))
      }
      log('RDS 创建任务达成')
    } finally {
      if (created) await this.cleanupRds(rds, dbName, log)
    }
  }

  private async cleanupRds(rds: any, dbName: string, log: LogFn) {
    log(fmt('开始清理数据库 %s ...', [dbName]))
    // creating 阶段 Delete 常被拒，短重试；deleting / 指令已接受即结束，绝不空等消失
    for (let i = 0; i < 8; i++) {
      try {
        const status = await this.rdsStatus(rds, dbName)
        if (!status) {
          log(fmt('清理结果：RDS 数据库 %s 已不存在', [dbName]))
          return
        }
        if (status === 'deleting') {
          log(fmt('清理结果：RDS 数据库 %s 删除中（视为清理完成）', [dbName]))
          return
        }
        try {
          await withAwsRetry('delete newbie RDS instance', () =>
            rds.send(
              new DeleteDBInstanceCommand({
                DBInstanceIdentifier: dbName,
                SkipFinalSnapshot: true,
                DeleteAutomatedBackups: true,
              }),
            ),
          )
          log(fmt('清理结果：RDS 数据库 %s 删除指令已接受（视为清理完成）', [dbName]))
          return
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error)
          // creating 时删不了：等几秒再试；试满仍失败则记日志结束（控制台可手删）
          log(fmt('当前状态 %s 暂时不能删除（%s），稍后重试…', [status, msg]))
        }
      } catch {
        log(fmt('清理结果：RDS 数据库 %s 已不存在', [dbName]))
        return
      }
      await this.sleep(POLL_MS)
    }
    log(fmt('清理结果：RDS 数据库 %s 删除指令暂未发出（creating 中常见），请到控制台确认或稍后手删', [dbName]))
  }

  private async createLambdaFunction(lambda: any, functionName: string, roleArn: string, log: LogFn, cancelled: CancelFn) {
    const input = {
      FunctionName: functionName,
      Runtime: 'python3.9' as any,
      Role: roleArn,
      Handler: 'lambda_function.lambda_handler',
      Code: { ZipFile: this.lambdaZip() },
    }
    // IAM 传播慢时 Create 会失败：最多约 45s（15×3s），成功即返回
    for (let i = 0; i < 15; i++) {
      await this.ensureNotCancelled(cancelled)
      try {
        await withAwsRetry('create newbie Lambda function', () => lambda.send(new CreateFunctionCommand(input)))
        return
      } catch (error) {
        if (await this.lambdaFunctionExists(lambda, functionName)) {
          log(fmt('函数 %s 已存在，视为创建成功。', [functionName]))
          return
        }
        if (i === 14) throw error
        log(fmt('函数创建暂未成功（IAM 传播中），%ss 后重试：%s', [String(POLL_MS / 1000), error instanceof Error ? error.message : String(error)]))
        await this.sleep(POLL_MS)
      }
    }
  }

  private async createOrGetRole(iam: any, roleName: string) {
    try {
      return await withAwsRetry('create newbie IAM role', () =>
        iam.send(
          new CreateRoleCommand({
            RoleName: roleName,
            AssumeRolePolicyDocument: JSON.stringify({
              Version: '2012-10-17',
              Statement: [
                {
                  Effect: 'Allow',
                  Principal: { Service: 'lambda.amazonaws.com' },
                  Action: 'sts:AssumeRole',
                },
              ],
            }),
          }),
        ),
      )
    } catch (error) {
      for (let i = 0; i < 5; i++) {
        try {
          return await withAwsRetry('get newbie IAM role', () => iam.send(new GetRoleCommand({ RoleName: roleName })))
        } catch {
          await this.sleep(POLL_MS)
        }
      }
      throw error
    }
  }

  private async deleteIamRole(iam: any, roleName: string, log: LogFn) {
    try {
      await withAwsRetry('delete newbie IAM role', () => iam.send(new DeleteRoleCommand({ RoleName: roleName })), ['NoSuchEntity'])
      log(fmt('IAM 角色 %s 已删除', [roleName]))
    } catch (error) {
      log(fmt('IAM 角色 %s 删除失败：%s', [roleName, error instanceof Error ? error.message : String(error)]))
    }
  }

  private async deleteLambdaFunction(lambda: any, functionName: string, log: LogFn) {
    try {
      await withAwsRetry('delete newbie Lambda function', () => lambda.send(new DeleteFunctionCommand({ FunctionName: functionName })), [
        'ResourceNotFoundException',
      ])
      // 产品约定：删除指令已接受 = 清理完成，不必轮询到函数完全消失
      log(fmt('清理结果：Lambda 函数 %s 删除指令已接受（视为清理完成）', [functionName]))
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      if (/ResourceNotFound|Function not found/i.test(msg)) {
        log(fmt('清理结果：Lambda 函数 %s 已不存在', [functionName]))
        return
      }
      log(fmt('清理结果：Lambda 函数 %s cleanup_failed：%s', [functionName, msg]))
    }
  }

  private async terminateEc2Instance(client: any, id: string, log: LogFn) {
    try {
      const result = await withAwsRetry('terminate newbie EC2 instance', () =>
        client.send(new TerminateInstancesCommand({ InstanceIds: [id] })),
      )
      const state = String((result as any)?.TerminatingInstances?.[0]?.CurrentState?.Name ?? '')
      // 终止中 / 已终止 都算清理完成，不空等 terminated
      log(
        fmt('清理结果：EC2 实例 %s 终止指令已接受，当前状态：%s（视为清理完成）', [
          id,
          state || 'unknown',
        ]),
      )
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      if (/InvalidInstanceID|NotFound/i.test(msg)) {
        log(fmt('清理结果：EC2 实例 %s 已不存在', [id]))
        return
      }
      log(fmt('清理结果：EC2 实例 %s cleanup_failed：%s', [id, msg]))
    }
  }

  private async latestAmazonLinuxAmi(client: any) {
    const result = await client.send(
      new DescribeImagesCommand({
        Owners: ['137112412989'],
        Filters: [
          { Name: 'name', Values: ['al2023-ami-2023.*'] },
          { Name: 'architecture', Values: ['x86_64'] },
          { Name: 'state', Values: ['available'] },
        ],
      }),
    )
    const images = [...(result.Images ?? [])].sort((a: any, b: any) => String(b.CreationDate ?? '').localeCompare(String(a.CreationDate ?? '')))
    const ami = String(images[0]?.ImageId ?? '')
    if (!ami) throw new Error('No Amazon Linux AMI found')
    return ami
  }

  private async findEc2InstanceByName(client: any, name: string) {
    for (let i = 0; i < 5; i++) {
      const result = await withAwsRetry('find newbie EC2 instance', () =>
        client.send(
          new DescribeInstancesCommand({
            Filters: [
              { Name: 'tag:Name', Values: [name] },
              { Name: 'instance-state-name', Values: ['pending', 'running', 'stopping', 'stopped', 'shutting-down'] },
            ],
          }),
        ),
      )
      for (const reservation of (result as any)?.Reservations ?? []) {
        for (const instance of reservation.Instances ?? []) {
          const id = String(instance.InstanceId ?? '')
          if (id) return id
        }
      }
      await this.sleep(POLL_MS)
    }
    return ''
  }

  private async ec2State(client: any, id: string) {
    const result = await client.send(new DescribeInstancesCommand({ InstanceIds: [id] }))
    return String(result.Reservations?.[0]?.Instances?.[0]?.State?.Name ?? '')
  }

  private async rdsStatus(rds: any, dbName: string) {
    const result = await withAwsRetry('describe newbie RDS instance', () =>
      rds.send(new DescribeDBInstancesCommand({ DBInstanceIdentifier: dbName })),
    )
    return String((result as any)?.DBInstances?.[0]?.DBInstanceStatus ?? '')
  }

  private async rdsExists(rds: any, dbName: string) {
    for (let i = 0; i < 5; i++) {
      try {
        await this.rdsStatus(rds, dbName)
        return true
      } catch {
        await this.sleep(POLL_MS)
      }
    }
    return false
  }

  private async budgetExists(budgets: any, accountId: string, name: string) {
    for (let i = 0; i < 3; i++) {
      try {
        await withAwsRetry('describe newbie budget', () =>
          budgets.send(new DescribeBudgetCommand({ AccountId: accountId, BudgetName: name })),
        )
        return true
      } catch {
        await this.sleep(POLL_MS)
      }
    }
    return false
  }

  private async lambdaFunctionExists(lambda: any, functionName: string) {
    for (let i = 0; i < 5; i++) {
      try {
        await withAwsRetry('get newbie Lambda function', () => lambda.send(new GetFunctionCommand({ FunctionName: functionName })))
        return true
      } catch {
        await this.sleep(POLL_MS)
      }
    }
    return false
  }

  /**
   * Build a minimal, valid ZIP (stored) with correct CRC32.
   * Hand-rolled ZIP with CRC=0 is rejected by Lambda: "error in the archive format".
   */
  private lambdaZip() {
    const source = 'def lambda_handler(event, context):\n    return {"ok": True}\n'
    const name = Buffer.from('lambda_function.py')
    const data = Buffer.from(source, 'utf8')
    const crc = this.crc32(data)
    const localHeader = Buffer.alloc(30 + name.length)
    localHeader.writeUInt32LE(0x04034b50, 0) // local file header
    localHeader.writeUInt16LE(20, 4) // version needed
    localHeader.writeUInt16LE(0, 6) // flags
    localHeader.writeUInt16LE(0, 8) // compression: stored
    localHeader.writeUInt16LE(0, 10) // mod time
    localHeader.writeUInt16LE(0, 12) // mod date
    localHeader.writeUInt32LE(crc >>> 0, 14)
    localHeader.writeUInt32LE(data.length, 18)
    localHeader.writeUInt32LE(data.length, 22)
    localHeader.writeUInt16LE(name.length, 26)
    localHeader.writeUInt16LE(0, 28)
    name.copy(localHeader, 30)

    const central = Buffer.alloc(46 + name.length)
    central.writeUInt32LE(0x02014b50, 0) // central directory
    central.writeUInt16LE(20, 4) // version made by
    central.writeUInt16LE(20, 6) // version needed
    central.writeUInt16LE(0, 8)
    central.writeUInt16LE(0, 10)
    central.writeUInt16LE(0, 12)
    central.writeUInt16LE(0, 14)
    central.writeUInt32LE(crc >>> 0, 16)
    central.writeUInt32LE(data.length, 20)
    central.writeUInt32LE(data.length, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt16LE(0, 30)
    central.writeUInt16LE(0, 32)
    central.writeUInt16LE(0, 34)
    central.writeUInt16LE(0, 36)
    central.writeUInt32LE(0, 38)
    central.writeUInt32LE(0, 42) // relative offset of local header
    name.copy(central, 46)

    const end = Buffer.alloc(22)
    end.writeUInt32LE(0x06054b50, 0)
    end.writeUInt16LE(0, 4)
    end.writeUInt16LE(0, 6)
    end.writeUInt16LE(1, 8)
    end.writeUInt16LE(1, 10)
    end.writeUInt32LE(central.length, 12)
    end.writeUInt32LE(localHeader.length + data.length, 16)
    end.writeUInt16LE(0, 20)
    return Buffer.concat([localHeader, data, central, end])
  }

  private crc32(buf: Buffer): number {
    let crc = 0xffffffff
    for (let i = 0; i < buf.length; i++) {
      crc ^= buf[i]
      for (let j = 0; j < 8; j++) {
        const mask = -(crc & 1)
        crc = (crc >>> 1) ^ (0xedb88320 & mask)
      }
    }
    return (crc ^ 0xffffffff) >>> 0
  }

  private async resolveAwsAccountId(account: AwsAccount): Promise<string> {
    try {
      const result = await withAwsRetry('get newbie caller identity', () =>
        this.clients.sts(account).send(new GetCallerIdentityCommand({})),
      )
      const id = String(result?.Account ?? '').trim()
      if (!/^\d{12}$/.test(id)) {
        throw new Error(`Unable to resolve AWS AccountId from STS (got: ${id || 'empty'})`)
      }
      return id
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      if (/security token.*invalid|InvalidClientTokenId|UnrecognizedClientException|ExpiredToken|invalid.*access.?key/i.test(msg)) {
        throw new Error(
          `AWS 账号密钥无效或已失效（本地账号：${account.id}）。请到「账号管理」重新填写 Access Key / Secret Key 后再试。原始错误：${msg}`,
        )
      }
      throw error instanceof Error ? error : new Error(msg)
    }
  }

  private operationId(operationIds: Record<string, string>, step: string) {
    return operationIds[step] || `nt-${crypto.randomBytes(8).toString('hex')}-${step}`
  }

  private shortId(value: string, length: number) {
    const id = value.toLowerCase().replace(/[^a-z0-9]+/g, '') || crypto.randomBytes(8).toString('hex')
    return id.slice(0, length)
  }

  private async ensureNotCancelled(cancelled: CancelFn) {
    if (await cancelled()) throw new NewbieTaskCancelledException('用户终止任务')
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
