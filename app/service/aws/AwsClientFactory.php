<?php

declare(strict_types=1);

namespace app\service\aws;

use Aws\Account\AccountClient;
use Aws\Budgets\BudgetsClient;
use Aws\CostExplorer\CostExplorerClient;
use Aws\Ec2\Ec2Client;
use Aws\Iam\IamClient;
use Aws\Lambda\LambdaClient;
use Aws\Lightsail\LightsailClient;
use Aws\Rds\RdsClient;
use Aws\ServiceQuotas\ServiceQuotasClient;
use Aws\Sts\StsClient;

class AwsClientFactory
{
    public function lightsail(array $account, string $region): LightsailClient
    {
        return new LightsailClient($this->clientConfig($account, $region));
    }

    public function ec2(array $account, string $region): Ec2Client
    {
        return new Ec2Client($this->clientConfig($account, $region));
    }

    public function budgets(array $account): BudgetsClient
    {
        return new BudgetsClient($this->clientConfig($account, 'us-east-1'));
    }

    public function iam(array $account): IamClient
    {
        return new IamClient($this->clientConfig($account, 'us-east-1'));
    }

    public function lambda(array $account, string $region): LambdaClient
    {
        return new LambdaClient($this->clientConfig($account, $region));
    }

    public function rds(array $account, string $region): RdsClient
    {
        return new RdsClient($this->clientConfig($account, $region));
    }

    public function sts(array $account): StsClient
    {
        return new StsClient($this->clientConfig($account, 'us-east-1'));
    }

    public function costExplorer(array $account): CostExplorerClient
    {
        return new CostExplorerClient($this->clientConfig($account, 'us-east-1'));
    }

    public function serviceQuotas(array $account, string $region): ServiceQuotasClient
    {
        return new ServiceQuotasClient($this->clientConfig($account, $region));
    }

    public function account(array $account): AccountClient
    {
        return new AccountClient($this->clientConfig($account, 'us-east-1'));
    }

    private function clientConfig(array $account, string $region): array
    {
        return [
            'version' => 'latest',
            'region' => $region,
            'credentials' => [
                'key' => $account['access_key'],
                'secret' => $account['secret_key'],
            ],
        ];
    }
}
