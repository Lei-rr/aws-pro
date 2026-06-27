<?php

declare(strict_types=1);

namespace app\service\aws;

use Throwable;

class RegionProvider
{
    public function __construct(private readonly AwsClientFactory $clients)
    {
    }

    public function regions(array $account): array
    {
        try {
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
        } catch (Throwable $exception) {
            throw AwsError::convert($exception, 'account.list_regions');
        }
    }

    public function enable(array $account, string $region): array
    {
        try {
            $this->clients->account($account)->enableRegion(['RegionName' => $region]);

            return ['account_id' => (string) $account['id'], 'region' => $region, 'status' => 'ENABLING'];
        } catch (Throwable $exception) {
            throw AwsError::convert($exception, 'account.enable_region');
        }
    }
}
