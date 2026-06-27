<?php

declare(strict_types=1);

namespace app\service\aws;

use Aws\Account\AccountClient;
use Aws\CostExplorer\CostExplorerClient;
use Aws\Lightsail\LightsailClient;
use Aws\ServiceQuotas\ServiceQuotasClient;

class AwsClientFactory
{
    public function lightsail(array $account, string $region): LightsailClient
    {
        return new LightsailClient($this->clientConfig($account, $region));
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
