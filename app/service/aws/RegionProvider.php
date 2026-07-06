<?php

declare(strict_types=1);

namespace app\service\aws;

use app\service\aws\concerns\AwsProviderCall;

class RegionProvider
{
    use AwsProviderCall;

    public function __construct(private readonly AwsClientFactory $clients)
    {
    }

    public function regions(array $account): array
    {
        return $this->call('account.list_regions', function () use ($account): array {
            $regions = [];
            $nextToken = null;
            do {
                $params = $nextToken === null ? [] : ['NextToken' => $nextToken];
                $result = $this->clients->account($account)->listRegions($params);
                foreach (($result['Regions'] ?? []) as $region) {
                    $name = (string) ($region['RegionName'] ?? '');
                    if ($name !== '') {
                        $regions[] = ['account_id' => (string) $account['id'], 'region' => $name, 'status' => (string) ($region['RegionOptStatus'] ?? 'UNKNOWN')];
                    }
                }
                $nextToken = isset($result['NextToken']) ? (string) $result['NextToken'] : null;
            } while ($nextToken !== null && $nextToken !== '');

            usort($regions, static fn (array $a, array $b): int => strcmp((string) $a['region'], (string) $b['region']));

            return $regions;
        });
    }

    public function enable(array $account, string $region): array
    {
        return $this->call('account.enable_region', function () use ($account, $region): array {
            $this->clients->account($account)->enableRegion(['RegionName' => $region]);

            return ['account_id' => (string) $account['id'], 'region' => $region, 'status' => 'ENABLING'];
        });
    }
}
