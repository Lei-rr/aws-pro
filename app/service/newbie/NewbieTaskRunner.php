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
                $state = $this->ec2State($client, $id);
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
                try {
                    $client->terminateInstances(['InstanceIds' => [$id]]);
                    $log('实例 %s 已发送终止指令', $id);
                } catch (Throwable $exception) {
                    $log('实例 %s 终止失败，请到控制台确认：%s', $id, $exception->getMessage());
                }
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
                $function = $lambda->getFunction(['FunctionName' => $functionName]);
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
            $lambda->invoke(['FunctionName' => $functionName]);
            $log('Lambda 调用成功，任务达成');
        } finally {
            try {
                if ($functionName !== '') {
                    $lambda->deleteFunction(['FunctionName' => $functionName]);
                    $log('Lambda 函数 %s 已删除', $functionName);
                }
            } catch (Throwable $exception) {
                $log('Lambda 函数 %s 删除失败，请到控制台确认：%s', $functionName, $exception->getMessage());
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

    private function taskRds(array $account, callable $log): void
    {
        $rds = $this->clients->rds($account, self::REGION);
        $dbName = 'db-' . $this->randomString(6);
        $created = false;
        try {
            $rds->createDBInstance([
                'DBInstanceIdentifier' => $dbName,
                'DBInstanceClass' => 'db.t3.micro',
                'Engine' => 'mysql',
                'MasterUsername' => 'admin',
                'MasterUserPassword' => 'Password123456',
                'AllocatedStorage' => 20,
                'BackupRetentionPeriod' => 0,
            ]);
            $created = true;
            $log('数据库 %s 正在创建，等待 available...', $dbName);
            $available = false;
            for ($i = 0; $i < 30; $i++) {
                sleep(30);
                $status = $this->rdsStatus($rds, $dbName);
                $log('当前状态：%s', $status ?: 'unknown');
                if ($status === 'available') {
                    $log('数据库已就绪，任务达成');
                    $available = true;
                    break;
                }
            }
            if (!$available) {
                throw new \RuntimeException('RDS instance did not reach available state');
            }
        } finally {
            if ($created) {
                $this->cleanupRds($rds, $dbName, $log);
            }
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
        for ($i = 0; $i < 24; $i++) {
            try {
                $status = $this->rdsStatus($rds, $dbName);
                if ($status === '') {
                    $log('数据库 %s 已删除', $dbName);
                    return;
                }
                if ($status !== 'deleting') {
                    $rds->deleteDBInstance([
                        'DBInstanceIdentifier' => $dbName,
                        'SkipFinalSnapshot' => true,
                        'DeleteAutomatedBackups' => true,
                    ]);
                    $log('删除指令已发送，当前状态：%s', $status);
                } else {
                    $log('删除进行中，当前状态：%s', $status);
                }
            } catch (Throwable $exception) {
                if (str_contains(strtolower($exception->getMessage()), 'dbinstancenotfound')) {
                    $log('数据库 %s 已删除', $dbName);
                    return;
                }
                $log('清理检查失败：%s', $exception->getMessage());
            }
            sleep(30);
        }
        $log('数据库清理重试超时，请稍后到控制台确认是否已删除');
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
