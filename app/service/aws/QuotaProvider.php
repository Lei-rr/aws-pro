<?php

declare(strict_types=1);

namespace app\service\aws;

use Exception;

class QuotaProvider
{
    public function __construct(private readonly AwsClientFactory $clients)
    {
    }

    public function vcpuQuota(array $account, string $region): array
    {
        $items = [];
        $client = $this->clients->serviceQuotas($account, $region);
        $codes = ['L-1216C47A' => 'On-Demand Standard vCPU', 'L-34B43A08' => 'Spot Standard vCPU'];

        foreach ($codes as $code => $fallbackName) {
            try {
                $quota = $client->getServiceQuota(['ServiceCode' => 'ec2', 'QuotaCode' => $code])['Quota'] ?? [];
                $items[] = ['account_id' => $account['id'], 'region' => $region, 'name' => $quota['QuotaName'] ?? $fallbackName, 'value' => $quota['Value'] ?? ''];
            } catch (Exception) {
                $items[] = ['account_id' => $account['id'], 'region' => $region, 'name' => $fallbackName, 'value' => '-', 'error' => true];
            }
        }

        return $items;
    }
}
