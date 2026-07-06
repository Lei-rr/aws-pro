<?php

declare(strict_types=1);

namespace app\service\newbie;

use app\service\aws\AwsClientFactory;
use app\service\aws\AwsRetry;
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

    public function run(array $account, string $step, array $operationIds, callable $log, ?callable $cancelled = null): void
    {
        $cancelled ??= static fn (): bool => false;
        $accountId = $this->accountId($account);
        $log('====== 自动执行 AWS 新手任务 ======');
        $log('区域：固定使用 %s，账户 ID：%s', self::REGION, $accountId);
        $log('执行范围：%s', $this->stepLabel($step));

        $steps = [
            'budget' => ['任务 1/4', self::STEPS['budget'], fn () => $this->taskBudget($account, $accountId, $this->operationId($operationIds, 'budget'), $log, $cancelled)],
            'ec2' => ['任务 2/4', self::STEPS['ec2'], fn () => $this->taskEc2($account, $this->operationId($operationIds, 'ec2'), $log, $cancelled)],
            'lambda' => ['任务 3/4', self::STEPS['lambda'], fn () => $this->taskLambda($account, $this->operationId($operationIds, 'lambda'), $log, $cancelled)],
            'rds' => ['任务 4/4', self::STEPS['rds'], fn () => $this->taskRds($account, $this->operationId($operationIds, 'rds'), $log, $cancelled)],
        ];
        foreach ($steps as $key => [$index, $title, $callback]) {
            if ($step !== 'all' && $step !== $key) {
                continue;
            }
            $this->ensureNotCancelled($cancelled);
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
        } catch (NewbieTaskCancelledException $exception) {
            $log('已终止：%s', $title);
            throw $exception;
        } catch (Throwable $exception) {
            $log('失败：%s', $exception->getMessage());
            throw $exception;
        }
    }

    private function taskBudget(array $account, string $accountId, string $operationId, callable $log, callable $cancelled): void
    {
        $this->ensureNotCancelled($cancelled);
        $name = 'AutoBudget-' . $this->shortId($operationId, 12);
        $email = 'alert-' . $this->shortId($operationId, 8) . '@gmail.com';
        $budgets = $this->clients->budgets($account);
        try {
            AwsRetry::run('create newbie budget', fn (): mixed => $budgets->createBudget([
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
            ]));
        } catch (Throwable $exception) {
            if (!$this->budgetExists($budgets, $accountId, $name)) {
                throw $exception;
            }
            $log('预算 %s 已存在，跳过创建。', $name);
            return;
        }
        $log('预算 %s 创建成功，订阅邮箱：%s', $name, $email);
    }

    private function taskEc2(array $account, string $operationId, callable $log, callable $cancelled): void
    {
        $this->ensureNotCancelled($cancelled);
        $client = $this->clients->ec2($account, self::REGION);
        $ami = $this->latestAmazonLinuxAmi($client);
        $id = '';
        $name = 'AutoEC2-' . $this->shortId($operationId, 12);
        try {
            try {
                $result = AwsRetry::run('run newbie EC2 instance', fn (): mixed => $client->runInstances([
                    'ImageId' => $ami,
                    'InstanceType' => 't3.micro',
                    'MinCount' => 1,
                    'MaxCount' => 1,
                    'ClientToken' => $operationId,
                    'TagSpecifications' => [[
                        'ResourceType' => 'instance',
                        'Tags' => [['Key' => 'Name', 'Value' => $name]],
                    ]],
                ]));
            } catch (Throwable $exception) {
                $id = $this->findEc2InstanceByName($client, $name);
                if ($id === '') {
                    throw $exception;
                }
                $log('实例 %s 已存在，继续轮询状态。', $id);
                $result = [];
            }
            $id = (string) ($result['Instances'][0]['InstanceId'] ?? '');
            if ($id === '') {
                $id = $this->findEc2InstanceByName($client, $name);
            }
            if ($id === '') {
                throw new \RuntimeException('EC2 RunInstances returned empty instance id');
            }
            $log('实例 %s 启动中，等待 running...', $id);
            $running = false;
            for ($i = 0; $i < 40; $i++) {
                $this->ensureNotCancelled($cancelled);
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

    private function taskLambda(array $account, string $operationId, callable $log, callable $cancelled): void
    {
        $this->ensureNotCancelled($cancelled);
        $iam = $this->clients->iam($account);
        $lambda = $this->clients->lambda($account, self::REGION);
        $roleName = 'AutoLambdaRole-' . $this->shortId($operationId, 10);
        $functionName = 'AutoFunc-' . $this->shortId($operationId, 10);
        $roleArn = '';
        try {
            $role = $this->createOrGetRole($iam, $roleName);
            $roleArn = (string) ($role['Role']['Arn'] ?? '');
            $log('临时 IAM 角色 %s 创建成功，等待生效...', $roleName);
            sleep(10);
            $this->ensureNotCancelled($cancelled);
            $this->createLambdaFunction($lambda, $functionName, $roleArn, $log, $cancelled);
            $log('函数 %s 创建成功，等待 active...', $functionName);
            $active = false;
            for ($i = 0; $i < 30; $i++) {
                $this->ensureNotCancelled($cancelled);
                sleep(2);
                try {
                    $function = AwsRetry::run('get newbie Lambda function state', fn (): mixed => $lambda->getFunction(['FunctionName' => $functionName]));
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
            $this->ensureNotCancelled($cancelled);
            $invoke = AwsRetry::run('invoke newbie Lambda function', fn (): mixed => $lambda->invoke(['FunctionName' => $functionName]));
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
                    $this->deleteIamRole($iam, $roleName, $log);
                }
            } catch (Throwable $exception) {
                $log('IAM 角色 %s 删除失败，请到控制台确认：%s', $roleName, $exception->getMessage());
            }
        }
    }

    private function terminateEc2Instance(Ec2Client $client, string $id, callable $log): void
    {
        try {
            $result = AwsRetry::run('terminate newbie EC2 instance', fn (): mixed => $client->terminateInstances(['InstanceIds' => [$id]]));
            $state = (string) ($result['TerminatingInstances'][0]['CurrentState']['Name'] ?? '');
            $log('实例 %s 已发送终止指令，当前状态：%s', $id, $state ?: 'unknown');
        } catch (Throwable $exception) {
            $log('清理结果：EC2 实例 %s cleanup_failed，请到控制台确认：%s', $id, $exception->getMessage());
            return;
        }
        for ($i = 0; $i < 80; $i++) {
            sleep(3);
            try {
                $state = $this->ec2State($client, $id);
            } catch (Throwable $exception) {
                if ($this->isEc2InstanceNotFound($exception)) {
                    $log('清理结果：EC2 实例 %s cleanup_confirmed', $id);
                    return;
                }
                $log('查询实例终止状态失败，继续等待：%s', $exception->getMessage());
                continue;
            }
            if ($state === 'terminated') {
                $log('清理结果：EC2 实例 %s cleanup_confirmed', $id);
                return;
            }
            $log('当前终止状态：%s', $state ?: 'unknown');
        }
        $log('清理结果：EC2 实例 %s cleanup_timeout，请稍后到控制台确认。', $id);
    }

    private function deleteLambdaFunction(mixed $lambda, string $functionName, callable $log): void
    {
        try {
            AwsRetry::run('delete newbie Lambda function', fn (): mixed => $lambda->deleteFunction(['FunctionName' => $functionName]));
            $log('Lambda 函数 %s 删除指令已接受', $functionName);
        } catch (Throwable $exception) {
            if ($this->isLambdaFunctionNotFound($exception)) {
                $log('清理结果：Lambda 函数 %s cleanup_skipped_not_found', $functionName);
                return;
            }
            $log('清理结果：Lambda 函数 %s cleanup_failed，请到控制台确认：%s', $functionName, $exception->getMessage());
            return;
        }
        for ($i = 0; $i < 30; $i++) {
            sleep(2);
            try {
                AwsRetry::run('get newbie Lambda function deletion state', fn (): mixed => $lambda->getFunction(['FunctionName' => $functionName]));
                $log('等待 Lambda 函数 %s 删除完成...', $functionName);
            } catch (Throwable $exception) {
                if ($this->isLambdaFunctionNotFound($exception)) {
                    $log('清理结果：Lambda 函数 %s cleanup_confirmed', $functionName);
                    return;
                }
                $log('查询 Lambda 删除状态失败，继续等待：%s', $exception->getMessage());
            }
        }
        $log('清理结果：Lambda 函数 %s cleanup_timeout，请稍后到控制台确认。', $functionName);
    }

    private function taskRds(array $account, string $operationId, callable $log, callable $cancelled): void
    {
        $this->ensureNotCancelled($cancelled);
        $rds = $this->clients->rds($account, self::REGION);
        $dbName = 'db-' . $this->shortId($operationId, 12);
        $created = false;
        $available = false;
        try {
            try {
                $result = AwsRetry::run('create newbie RDS instance', fn (): mixed => $rds->createDBInstance([
                    'DBInstanceIdentifier' => $dbName,
                    'DBInstanceClass' => 'db.t3.micro',
                    'Engine' => 'mysql',
                    'MasterUsername' => 'admin',
                    'MasterUserPassword' => 'Password123456',
                    'AllocatedStorage' => 20,
                    'BackupRetentionPeriod' => 0,
                ]));
                $returnedId = (string) ($result['DBInstance']['DBInstanceIdentifier'] ?? '');
                if ($returnedId === '') {
                    throw new \RuntimeException('RDS CreateDBInstance returned empty instance id');
                }
            } catch (Throwable $exception) {
                if (!$this->rdsExists($rds, $dbName)) {
                    throw $exception;
                }
                $log('数据库 %s 已存在，继续轮询状态。', $dbName);
            }
            $created = true;
            $log('数据库 %s 正在创建，等待 available...', $dbName);
            for ($i = 0; $i < 30; $i++) {
                $this->ensureNotCancelled($cancelled);
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

    private function createLambdaFunction(mixed $lambda, string $functionName, string $roleArn, callable $log, callable $cancelled): void
    {
        $input = [
            'FunctionName' => $functionName,
            'Runtime' => 'python3.9',
            'Role' => $roleArn,
            'Handler' => 'lambda_function.lambda_handler',
            'Code' => ['ZipFile' => $this->lambdaZip()],
        ];
        for ($i = 0; $i < 2; $i++) {
            $this->ensureNotCancelled($cancelled);
            try {
                AwsRetry::run('create newbie Lambda function', fn (): mixed => $lambda->createFunction($input));
                return;
            } catch (Throwable $exception) {
                if ($this->lambdaFunctionExists($lambda, $functionName)) {
                    $log('函数 %s 已存在，继续轮询状态。', $functionName);
                    return;
                }
                if ($i === 1) {
                    throw $exception;
                }
                $log('函数创建暂未成功，等待 IAM 角色传播后重试：%s', $exception->getMessage());
                sleep(5);
            }
        }
    }

    private function budgetExists(mixed $budgets, string $accountId, string $name): bool
    {
        for ($i = 0; $i < 3; $i++) {
            try {
                AwsRetry::run('describe newbie budget', fn (): mixed => $budgets->describeBudget(['AccountId' => $accountId, 'BudgetName' => $name]));

                return true;
            } catch (Throwable) {
                sleep(1);
            }
        }

        return false;
    }

    private function findEc2InstanceByName(Ec2Client $client, string $name): string
    {
        for ($i = 0; $i < 5; $i++) {
            $result = AwsRetry::run('find newbie EC2 instance', fn (): mixed => $client->describeInstances([
                'Filters' => [
                    ['Name' => 'tag:Name', 'Values' => [$name]],
                    ['Name' => 'instance-state-name', 'Values' => ['pending', 'running', 'stopping', 'stopped', 'shutting-down']],
                ],
            ]));
            foreach (($result['Reservations'] ?? []) as $reservation) {
                foreach (($reservation['Instances'] ?? []) as $instance) {
                    $id = (string) ($instance['InstanceId'] ?? '');
                    if ($id !== '') {
                        return $id;
                    }
                }
            }
            sleep(2);
        }

        return '';
    }

    private function createOrGetRole(mixed $iam, string $roleName): array
    {
        try {
            return AwsRetry::run('create newbie IAM role', fn (): mixed => $iam->createRole([
                'RoleName' => $roleName,
                'AssumeRolePolicyDocument' => json_encode([
                    'Version' => '2012-10-17',
                    'Statement' => [[
                        'Effect' => 'Allow',
                        'Principal' => ['Service' => 'lambda.amazonaws.com'],
                        'Action' => 'sts:AssumeRole',
                    ]],
                ], JSON_UNESCAPED_SLASHES),
            ]));
        } catch (Throwable $exception) {
            for ($i = 0; $i < 5; $i++) {
                try {
                    return AwsRetry::run('get newbie IAM role', fn (): mixed => $iam->getRole(['RoleName' => $roleName]));
                } catch (Throwable) {
                    sleep(2);
                }
            }
            throw $exception;
        }
    }

    private function lambdaFunctionExists(mixed $lambda, string $functionName): bool
    {
        for ($i = 0; $i < 5; $i++) {
            try {
                AwsRetry::run('get newbie Lambda function', fn (): mixed => $lambda->getFunction(['FunctionName' => $functionName]));

                return true;
            } catch (Throwable) {
                sleep(2);
            }
        }

        return false;
    }

    private function rdsExists(mixed $rds, string $dbName): bool
    {
        for ($i = 0; $i < 5; $i++) {
            try {
                $this->rdsStatus($rds, $dbName);

                return true;
            } catch (Throwable) {
                sleep(2);
            }
        }

        return false;
    }

    private function operationId(array $operationIds, string $step): string
    {
        $value = (string) ($operationIds[$step] ?? '');

        return $value !== '' ? $value : 'nt-' . bin2hex(random_bytes(8)) . '-' . $step;
    }

    private function shortId(string $value, int $length): string
    {
        $id = strtolower(preg_replace('/[^a-z0-9]+/', '', $value) ?? '');
        if ($id === '') {
            $id = bin2hex(random_bytes(8));
        }

        return substr($id, 0, $length);
    }

    private function cleanupRds(mixed $rds, string $dbName, callable $log): void
    {
        $log('开始清理数据库 %s ...', $dbName);
        $deleteRequested = false;
        for ($i = 0; $i < 36; $i++) {
            try {
                $status = $this->rdsStatus($rds, $dbName);
                if ($status === '') {
                    $log('清理结果：RDS 数据库 %s cleanup_confirmed', $dbName);
                    return;
                }
                if ($status === 'deleting') {
                    $log('数据库 %s 删除中，当前状态：%s', $dbName, $status);
                    sleep(30);
                    continue;
                }
                if (!$deleteRequested) {
                    try {
                        AwsRetry::run('delete newbie RDS instance', fn (): mixed => $rds->deleteDBInstance([
                            'DBInstanceIdentifier' => $dbName,
                            'SkipFinalSnapshot' => true,
                            'DeleteAutomatedBackups' => true,
                        ]));
                        $deleteRequested = true;
                        $log('删除指令已发送，当前状态：%s', $status);
                    } catch (Throwable $exception) {
                        if (!$this->isRdsDeleteRetryable($exception)) {
                            $log('清理结果：RDS 数据库 %s cleanup_failed，请到控制台确认：%s', $dbName, $exception->getMessage());
                            return;
                        }
                        $log('当前状态 %s 暂时不能删除，稍后重试。', $status);
                    }
                }
            } catch (Throwable $exception) {
                if ($this->isRdsInstanceNotFound($exception)) {
                    $log('清理结果：RDS 数据库 %s cleanup_confirmed', $dbName);
                    return;
                }
                $log('清理检查失败：%s', $exception->getMessage());
            }
            sleep(30);
        }
        $log('清理结果：RDS 数据库 %s cleanup_timeout，请稍后到控制台确认。', $dbName);
    }

    private function deleteIamRole(mixed $iam, string $roleName, callable $log): void
    {
        try {
            AwsRetry::run('delete newbie IAM role', fn (): mixed => $iam->deleteRole(['RoleName' => $roleName]));
            $log('IAM 角色 %s 删除指令已接受', $roleName);
        } catch (Throwable $exception) {
            if ($this->isIamRoleNotFound($exception)) {
                $log('清理结果：IAM 角色 %s cleanup_skipped_not_found', $roleName);
                return;
            }
            throw $exception;
        }
        for ($i = 0; $i < 30; $i++) {
            sleep(2);
            try {
                AwsRetry::run('get newbie IAM role deletion state', fn (): mixed => $iam->getRole(['RoleName' => $roleName]));
                $log('等待 IAM 角色 %s 删除完成...', $roleName);
            } catch (Throwable $exception) {
                if ($this->isIamRoleNotFound($exception)) {
                    $log('清理结果：IAM 角色 %s cleanup_confirmed', $roleName);
                    return;
                }
                $log('查询 IAM 角色删除状态失败，继续等待：%s', $exception->getMessage());
            }
        }
        $log('清理结果：IAM 角色 %s cleanup_timeout，请稍后到控制台确认。', $roleName);
    }

    private function isEc2InstanceNotFound(Throwable $exception): bool
    {
        $code = $this->awsErrorCode($exception);
        if ($code !== '') {
            return $code === 'InvalidInstanceID.NotFound';
        }
        $message = strtolower($exception->getMessage());

        return str_contains($message, 'invalidinstanceid.notfound') || str_contains($message, 'instance id does not exist');
    }

    private function isLambdaFunctionNotFound(Throwable $exception): bool
    {
        $code = $this->awsErrorCode($exception);
        if ($code !== '') {
            return $code === 'ResourceNotFoundException';
        }

        $message = strtolower($exception->getMessage());

        return str_contains($message, 'resourcenotfoundexception') || str_contains($message, 'function not found');
    }

    private function isIamRoleNotFound(Throwable $exception): bool
    {
        $code = $this->awsErrorCode($exception);
        if ($code !== '') {
            return $code === 'NoSuchEntity';
        }
        $message = strtolower($exception->getMessage());

        return str_contains($message, 'nosuchentity') || str_contains($message, 'role not found') || str_contains($message, 'not found');
    }

    private function isRdsInstanceNotFound(Throwable $exception): bool
    {
        $code = $this->awsErrorCode($exception);
        if ($code !== '') {
            return $code === 'DBInstanceNotFound';
        }
        $message = strtolower($exception->getMessage());

        return str_contains($message, 'dbinstancenotfound') || str_contains($message, 'db instance not found');
    }

    private function isRdsDeleteRetryable(Throwable $exception): bool
    {
        $code = $this->awsErrorCode($exception);
        if ($code !== '') {
            return in_array($code, ['InvalidDBInstanceState', 'InvalidDBInstanceStateFault'], true);
        }
        $message = strtolower($exception->getMessage());

        return str_contains($message, 'invaliddbinstancestate')
            || str_contains($message, 'is not in available state')
            || str_contains($message, 'is not in deleting state')
            || str_contains($message, 'cannot delete')
            || str_contains($message, 'creating');
    }

    private function ensureNotCancelled(callable $cancelled): void
    {
        if ($cancelled()) {
            throw new NewbieTaskCancelledException('用户已请求终止任务，正在停止后续操作并清理已创建资源');
        }
    }

    private function awsErrorCode(Throwable $exception): string
    {
        do {
            if (method_exists($exception, 'getAwsErrorCode')) {
                return (string) $exception->getAwsErrorCode();
            }
            $exception = $exception->getPrevious();
        } while ($exception !== null);

        return '';
    }

    private function accountId(array $account): string
    {
        $result = AwsRetry::run('get newbie caller identity', fn (): mixed => $this->clients->sts($account)->getCallerIdentity([]));

        return (string) ($result['Account'] ?? '');
    }

    private function latestAmazonLinuxAmi(Ec2Client $client): string
    {
        $result = AwsRetry::run('describe newbie EC2 AMIs', fn (): mixed => $client->describeImages([
            'Owners' => ['137112412989'],
            'Filters' => [
                ['Name' => 'name', 'Values' => ['al2023-ami-2023.*']],
                ['Name' => 'architecture', 'Values' => ['x86_64']],
                ['Name' => 'virtualization-type', 'Values' => ['hvm']],
            ],
        ]));
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
        $result = AwsRetry::run('describe newbie EC2 instance state', fn (): mixed => $client->describeInstances(['InstanceIds' => [$id]]));

        return (string) ($result['Reservations'][0]['Instances'][0]['State']['Name'] ?? '');
    }

    private function rdsStatus(mixed $rds, string $dbName): string
    {
        $result = AwsRetry::run('describe newbie RDS instance state', fn (): mixed => $rds->describeDBInstances(['DBInstanceIdentifier' => $dbName]));

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

}
