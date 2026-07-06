<?php

declare(strict_types=1);

namespace app\service\newbie;

use app\service\aws\AwsClientFactory;
use Aws\Ec2\Ec2Client;
use Throwable;

class NewbieTaskRunner
{
    private const REGION = 'us-east-1';
    private const STEPS = [
        'all' => '全部任务',
        'budget' => '设置 AWS Cost Budget',
        'ec2' => '启动并终止 EC2 实例',
        'lambda' => '创建并调用 Lambda 函数',
        'rds' => '创建并清理 RDS 数据库',
    ];

    public function __construct(private readonly AwsClientFactory $clients)
    {
    }

    public function hasStep(string $step): bool
    {
        return isset(self::STEPS[$step]);
    }

    public function stepLabel(string $step): string
    {
        return self::STEPS[$step] ?? $step;
    }

    public function run(array $account, string $step, callable $log): void
    {
        $accountId = $this->accountId($account);
        $log('====== 自动执行 AWS 新手任务 ======');
        $log('区域：固定使用 %s，账户 ID：%s', self::REGION, $accountId);
        $log('执行范围：%s', $this->stepLabel($step));

        $steps = [
            'budget' => ['任务 1/4', self::STEPS['budget'], fn () => $this->taskBudget($account, $accountId, $log)],
            'ec2' => ['任务 2/4', self::STEPS['ec2'], fn () => $this->taskEc2($account, $log)],
            'lambda' => ['任务 3/4', self::STEPS['lambda'], fn () => $this->taskLambda($account, $log)],
            'rds' => ['任务 4/4', self::STEPS['rds'], fn () => $this->taskRds($account, $log)],
        ];
        foreach ($steps as $key => [$index, $title, $callback]) {
            if ($step !== 'all' && $step !== $key) {
                continue;
            }
            $this->runStep($log, $index, $title, $callback);
        }

        $log('====== 已选择流程执行完毕 ======');
    }

    private function runStep(callable $log, string $index, string $title, callable $callback): void
    {
        $log('');
        $log('[%s] %s...', $index, $title);
        try {
            $callback();
            $log('完成：%s', $title);
        } catch (Throwable $exception) {
            $log('失败：%s', $exception->getMessage());
            throw $exception;
        }
    }

    private function taskBudget(array $account, string $accountId, callable $log): void
    {
        $name = 'AutoBudget-' . $this->randomString(6);
        $email = 'alert-' . $this->randomString(4) . '@gmail.com';
        $this->clients->budgets($account)->createBudget([
            'AccountId' => $accountId,
            'Budget' => [
                'BudgetName' => $name,
                'BudgetType' => 'COST',
                'TimeUnit' => 'MONTHLY',
                'BudgetLimit' => ['Amount' => '10.0', 'Unit' => 'USD'],
            ],
            'NotificationsWithSubscribers' => [[
                'Notification' => [
                    'NotificationType' => 'ACTUAL',
                    'ComparisonOperator' => 'GREATER_THAN',
                    'Threshold' => 80.0,
                ],
                'Subscribers' => [[
                    'SubscriptionType' => 'EMAIL',
                    'Address' => $email,
                ]],
            ]],
        ]);
        $log('预算 %s 创建成功，订阅邮箱：%s', $name, $email);
    }

    private function taskEc2(array $account, callable $log): void
    {
        $client = $this->clients->ec2($account, self::REGION);
        $ami = $this->latestAmazonLinuxAmi($client);
        $id = '';
        try {
            $result = $client->runInstances([
                'ImageId' => $ami,
                'InstanceType' => 't3.micro',
                'MinCount' => 1,
                'MaxCount' => 1,
            ]);
            $id = (string) ($result['Instances'][0]['InstanceId'] ?? '');
            if ($id === '') {
                throw new \RuntimeException('EC2 RunInstances returned empty instance id');
            }
            $log('实例 %s 启动中，等待 running...', $id);
            $running = false;
            for ($i = 0; $i < 40; $i++) {
                sleep(3);
                try {
                    $state = $this->ec2State($client, $id);
                } catch (Throwable $exception) {
                    $log('查询实例状态失败，继续等待：%s', $exception->getMessage());
                    continue;
                }
                if ($state === 'running') {
                    $log('状态：running，任务达成');
                    $running = true;
                    break;
                }
                $log('当前状态：%s', $state ?: 'unknown');
            }
            if (!$running) {
                throw new \RuntimeException('EC2 instance did not reach running state');
            }
        } finally {
            if ($id !== '') {
                $this->terminateEc2Instance($client, $id, $log);
            }
        }
    }

    private function taskLambda(array $account, callable $log): void
    {
        $iam = $this->clients->iam($account);
        $lambda = $this->clients->lambda($account, self::REGION);
        $roleName = 'AutoLambdaRole-' . $this->randomString(5);
        $functionName = 'AutoFunc-' . $this->randomString(5);
        $roleArn = '';
        try {
            $role = $iam->createRole([
                'RoleName' => $roleName,
                'AssumeRolePolicyDocument' => json_encode([
                    'Version' => '2012-10-17',
                    'Statement' => [[
                        'Effect' => 'Allow',
                        'Principal' => ['Service' => 'lambda.amazonaws.com'],
                        'Action' => 'sts:AssumeRole',
                    ]],
                ], JSON_UNESCAPED_SLASHES),
            ]);
            $roleArn = (string) ($role['Role']['Arn'] ?? '');
            $log('临时 IAM 角色 %s 创建成功，等待生效...', $roleName);
            sleep(10);
            $this->createLambdaFunction($lambda, $functionName, $roleArn, $log);
            $log('函数 %s 创建成功，等待 active...', $functionName);
            $active = false;
            for ($i = 0; $i < 30; $i++) {
                sleep(2);
                try {
                    $function = $lambda->getFunction(['FunctionName' => $functionName]);
                } catch (Throwable $exception) {
                    $log('查询 Lambda 状态失败，继续等待：%s', $exception->getMessage());
                    continue;
                }
                $state = (string) ($function['Configuration']['State'] ?? '');
                if ($state === 'Active') {
                    $active = true;
                    break;
                }
                $log('当前状态：%s', $state ?: 'unknown');
            }
            if (!$active) {
                throw new \RuntimeException('Lambda function did not reach Active state');
            }
            $invoke = $lambda->invoke(['FunctionName' => $functionName]);
            $statusCode = (int) ($invoke['StatusCode'] ?? 0);
            $functionError = (string) ($invoke['FunctionError'] ?? '');
            if ($statusCode < 200 || $statusCode >= 300 || $functionError !== '') {
                throw new \RuntimeException(sprintf('Lambda invoke failed, status=%d error=%s', $statusCode, $functionError ?: 'none'));
            }
            $log('Lambda 调用成功，任务达成');
        } finally {
            if ($functionName !== '') {
                $this->deleteLambdaFunction($lambda, $functionName, $log);
            }
            sleep(3);
            try {
                if ($roleName !== '') {
                    $iam->deleteRole(['RoleName' => $roleName]);
                    $log('IAM 角色 %s 已删除', $roleName);
                }
            } catch (Throwable $exception) {
                $log('IAM 角色 %s 删除失败，请到控制台确认：%s', $roleName, $exception->getMessage());
            }
        }
    }

    private function terminateEc2Instance(Ec2Client $client, string $id, callable $log): void
    {
        try {
            $result = $client->terminateInstances(['InstanceIds' => [$id]]);
            $state = (string) ($result['TerminatingInstances'][0]['CurrentState']['Name'] ?? '');
            if (in_array($state, ['shutting-down', 'terminated'], true)) {
                $log('实例 %s 已进入终止流程，当前状态：%s', $id, $state);
                return;
            }
            $log('实例 %s 已发送终止指令，等待进入终止流程...', $id);
        } catch (Throwable $exception) {
            $log('实例 %s 终止指令发送失败，请到控制台确认：%s', $id, $exception->getMessage());
            return;
        }
        for ($i = 0; $i < 10; $i++) {
            sleep(3);
            try {
                $state = $this->ec2State($client, $id);
            } catch (Throwable $exception) {
                $log('查询实例终止状态失败，继续等待：%s', $exception->getMessage());
                continue;
            }
            if (in_array($state, ['shutting-down', 'terminated'], true)) {
                $log('实例 %s 已进入终止流程，当前状态：%s', $id, $state);
                return;
            }
            $log('当前终止状态：%s', $state ?: 'unknown');
        }
        $log('实例 %s 终止流程确认超时，请稍后到控制台确认。', $id);
    }

    private function deleteLambdaFunction(mixed $lambda, string $functionName, callable $log): void
    {
        try {
            $lambda->deleteFunction(['FunctionName' => $functionName]);
            $log('Lambda 函数 %s 删除指令已接受', $functionName);
        } catch (Throwable $exception) {
            if ($this->isLambdaFunctionNotFound($exception)) {
                $log('Lambda 函数 %s 已不存在', $functionName);
                return;
            }
            $log('Lambda 函数 %s 删除指令发送失败，请到控制台确认：%s', $functionName, $exception->getMessage());
            return;
        }
    }

    private function isLambdaFunctionNotFound(Throwable $exception): bool
    {
        if (method_exists($exception, 'getAwsErrorCode') && (string) $exception->getAwsErrorCode() === 'ResourceNotFoundException') {
            return true;
        }
        $message = strtolower($exception->getMessage());

        return str_contains($message, 'resourcenotfoundexception') || str_contains($message, 'function not found');
    }

    private function taskRds(array $account, callable $log): void
    {
        $rds = $this->clients->rds($account, self::REGION);
        $dbName = 'db-' . $this->randomString(6);
        $created = false;
        $available = false;
        try {
            $result = $rds->createDBInstance([
                'DBInstanceIdentifier' => $dbName,
                'DBInstanceClass' => 'db.t3.micro',
                'Engine' => 'mysql',
                'MasterUsername' => 'admin',
                'MasterUserPassword' => 'Password123456',
                'AllocatedStorage' => 20,
                'BackupRetentionPeriod' => 0,
            ]);
            $returnedId = (string) ($result['DBInstance']['DBInstanceIdentifier'] ?? '');
            if ($returnedId === '') {
                throw new \RuntimeException('RDS CreateDBInstance returned empty instance id');
            }
            $created = true;
            $log('数据库 %s 正在创建，等待 available...', $dbName);
            for ($i = 0; $i < 30; $i++) {
                sleep(30);
                try {
                    $status = $this->rdsStatus($rds, $dbName);
                } catch (Throwable $exception) {
                    $log('查询数据库状态失败，继续等待：%s', $exception->getMessage());
                    continue;
                }
                $log('当前状态：%s', $status ?: 'unknown');
                if ($status === 'available') {
                    $log('数据库已就绪，任务达成');
                    $available = true;
                    break;
                }
            }
            if (!$available) {
                $log('等待超时，数据库可能仍在创建中，接下来继续自动清理。');
            }
        } finally {
            if ($created) {
                $this->cleanupRds($rds, $dbName, $log);
            }
        }
        if (!$available) {
            throw new \RuntimeException('RDS instance did not reach available state');
        }
    }

    private function createLambdaFunction(mixed $lambda, string $functionName, string $roleArn, callable $log): void
    {
        $input = [
            'FunctionName' => $functionName,
            'Runtime' => 'python3.9',
            'Role' => $roleArn,
            'Handler' => 'lambda_function.lambda_handler',
            'Code' => ['ZipFile' => $this->lambdaZip()],
        ];
        for ($i = 0; $i < 2; $i++) {
            try {
                $lambda->createFunction($input);
                return;
            } catch (Throwable $exception) {
                if ($i === 1) {
                    throw $exception;
                }
                $log('函数创建暂未成功，等待 IAM 角色传播后重试：%s', $exception->getMessage());
                sleep(5);
            }
        }
    }

    private function cleanupRds(mixed $rds, string $dbName, callable $log): void
    {
        $log('开始清理数据库 %s ...', $dbName);
        $deleteRequested = false;
        for ($i = 0; $i < 12; $i++) {
            try {
                $status = $this->rdsStatus($rds, $dbName);
                if ($status === '') {
                    $log('数据库 %s 已删除', $dbName);
                    return;
                }
                if ($status === 'deleting') {
                    $log('数据库 %s 已进入删除流程，当前状态：%s', $dbName, $status);
                    return;
                }
                if (!$deleteRequested) {
                    try {
                        $rds->deleteDBInstance([
                            'DBInstanceIdentifier' => $dbName,
                            'SkipFinalSnapshot' => true,
                            'DeleteAutomatedBackups' => true,
                        ]);
                        $deleteRequested = true;
                        $log('删除指令已发送，当前状态：%s', $status);
                    } catch (Throwable $exception) {
                        if (!$this->isRdsDeleteRetryable($exception)) {
                            $log('自动删除数据库失败：%s', $exception->getMessage());
                            return;
                        }
                        $log('当前状态 %s 暂时不能删除，稍后重试。', $status);
                    }
                } else {
                    $log('等待进入删除流程，当前状态：%s', $status);
                }
            } catch (Throwable $exception) {
                if ($this->isRdsInstanceNotFound($exception)) {
                    $log('数据库 %s 已删除', $dbName);
                    return;
                }
                $log('清理检查失败：%s', $exception->getMessage());
            }
            sleep(30);
        }
        $log('数据库删除流程确认超时，请稍后到控制台确认。');
    }

    private function isRdsInstanceNotFound(Throwable $exception): bool
    {
        $message = strtolower($exception->getMessage());

        return str_contains($message, 'dbinstancenotfound') || str_contains($message, 'db instance not found');
    }

    private function isRdsDeleteRetryable(Throwable $exception): bool
    {
        $message = strtolower($exception->getMessage());

        return str_contains($message, 'invaliddbinstancestate')
            || str_contains($message, 'is not in available state')
            || str_contains($message, 'is not in deleting state')
            || str_contains($message, 'cannot delete')
            || str_contains($message, 'creating');
    }

    private function accountId(array $account): string
    {
        $result = $this->clients->sts($account)->getCallerIdentity([]);

        return (string) ($result['Account'] ?? '');
    }

    private function latestAmazonLinuxAmi(Ec2Client $client): string
    {
        $result = $client->describeImages([
            'Owners' => ['137112412989'],
            'Filters' => [
                ['Name' => 'name', 'Values' => ['al2023-ami-2023.*']],
                ['Name' => 'architecture', 'Values' => ['x86_64']],
                ['Name' => 'virtualization-type', 'Values' => ['hvm']],
            ],
        ]);
        $images = $result['Images'] ?? [];
        usort($images, static fn (array $a, array $b): int => strcmp((string) ($b['CreationDate'] ?? ''), (string) ($a['CreationDate'] ?? '')));
        $ami = (string) ($images[0]['ImageId'] ?? '');
        if ($ami === '') {
            throw new \RuntimeException('No Amazon Linux 2023 AMI found');
        }

        return $ami;
    }

    private function ec2State(Ec2Client $client, string $id): string
    {
        $result = $client->describeInstances(['InstanceIds' => [$id]]);

        return (string) ($result['Reservations'][0]['Instances'][0]['State']['Name'] ?? '');
    }

    private function rdsStatus(mixed $rds, string $dbName): string
    {
        $result = $rds->describeDBInstances(['DBInstanceIdentifier' => $dbName]);

        return (string) ($result['DBInstances'][0]['DBInstanceStatus'] ?? '');
    }

    private function lambdaZip(): string
    {
        return $this->zipFile('lambda_function.py', 'def lambda_handler(event, context): return "Hello AWS"');
    }

    private function zipFile(string $filename, string $content): string
    {
        $crc = crc32($content);
        $size = strlen($content);
        $nameSize = strlen($filename);
        $local = "PK\x03\x04" . pack('vvvvvVVVvv', 20, 0, 0, 0, 0, $crc, $size, $size, $nameSize, 0) . $filename . $content;
        $central = "PK\x01\x02" . pack('vvvvvvVVVvvvvvVV', 20, 20, 0, 0, 0, 0, $crc, $size, $size, $nameSize, 0, 0, 0, 0, 0, 0) . $filename;
        $end = "PK\x05\x06" . pack('vvvvVVv', 0, 0, 1, 1, strlen($central), strlen($local), 0);

        return $local . $central . $end;
    }

    private function randomString(int $length): string
    {
        $chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
        $value = '';
        for ($i = 0; $i < $length; $i++) {
            $value .= $chars[random_int(0, strlen($chars) - 1)];
        }

        return $value;
    }
}
