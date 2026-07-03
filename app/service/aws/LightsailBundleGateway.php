<?php

declare(strict_types=1);

namespace app\service\aws;

use Aws\Lightsail\LightsailClient;
use Throwable;

class LightsailBundleGateway
{
    public function __construct(private readonly AwsClientFactory $clients)
    {
    }

    public function bundles(array $account, string $region): array
    {
        return $this->call('lightsail.bundles', function () use ($account, $region): array {
            $items = [];
            foreach (($this->client($account, $region)->getBundles([])['bundles'] ?? []) as $item) {
                $bundleId = (string) ($item['bundleId'] ?? '');
                if ($bundleId === '') {
                    continue;
                }

                $items[$bundleId] = [
                    'label' => $this->bundleLabel($bundleId, $item),
                    'specs' => $this->bundleSpecs($item),
                ];
            }

            return $items;
        });
    }

    private function client(array $account, string $region): LightsailClient
    {
        return $this->clients->lightsail($account, $region);
    }

    private function bundleLabel(string $bundleId, array $bundle): string
    {
        return sprintf(
            '%s | %s cpu | %sGB RAM | %sGB disk | %sTB transfer | $%s/month',
            $bundle['name'] ?? $bundleId,
            $bundle['cpuCount'] ?? '-',
            $bundle['ramSizeInGb'] ?? '-',
            $bundle['diskSizeInGb'] ?? '-',
            !empty($bundle['transferPerMonthInGb']) ? round($bundle['transferPerMonthInGb'] / 1024, 2) : '-',
            $bundle['price'] ?? '-'
        );
    }

    private function bundleSpecs(array $bundle): array
    {
        return [
            'cpu' => isset($bundle['cpuCount']) ? (int) $bundle['cpuCount'] : null,
            'memory' => isset($bundle['ramSizeInGb']) ? (float) $bundle['ramSizeInGb'] : null,
            'disk' => isset($bundle['diskSizeInGb']) ? (int) $bundle['diskSizeInGb'] : null,
            'transfer' => !empty($bundle['transferPerMonthInGb']) ? ((float) $bundle['transferPerMonthInGb']) / 1024 : null,
            'price' => isset($bundle['price']) ? (float) $bundle['price'] : null,
        ];
    }

    private function call(string $operation, callable $callback): mixed
    {
        try {
            return $callback();
        } catch (Throwable $exception) {
            throw AwsError::convert($exception, $operation);
        }
    }
}
