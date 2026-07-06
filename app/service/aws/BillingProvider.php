<?php

declare(strict_types=1);

namespace app\service\aws;

use app\service\aws\concerns\AwsProviderCall;
use DateTimeImmutable;

class BillingProvider
{
    use AwsProviderCall;

    public function __construct(private readonly AwsClientFactory $clients)
    {
    }

    public function yearlyCostAndCredits(array $account): array
    {
        return $this->call('billing.yearly', function () use ($account): array {
            $costs = [];
            $credits = [];
            $client = $this->clients->costExplorer($account);
            $start = new DateTimeImmutable('first day of this month -12 months');
            $end = new DateTimeImmutable('tomorrow');
            $base = ['TimePeriod' => ['Start' => $start->format('Y-m-d'), 'End' => $end->format('Y-m-d')], 'Granularity' => 'MONTHLY', 'Metrics' => ['UnblendedCost']];

            foreach (($client->getCostAndUsage($base)['ResultsByTime'] ?? []) as $row) {
                $costs[substr((string) ($row['TimePeriod']['Start'] ?? ''), 0, 7)] = $row['Total']['UnblendedCost']['Amount'] ?? '0';
            }

            $creditQuery = $base;
            $creditQuery['Filter'] = ['Dimensions' => ['Key' => 'RECORD_TYPE', 'Values' => ['Credit']]];
            foreach (($client->getCostAndUsage($creditQuery)['ResultsByTime'] ?? []) as $row) {
                $credits[substr((string) ($row['TimePeriod']['Start'] ?? ''), 0, 7)] = $row['Total']['UnblendedCost']['Amount'] ?? '0';
            }

            $months = array_unique(array_merge(array_keys($costs), array_keys($credits)));
            rsort($months);

            return array_map(static fn (string $month): array => ['account_id' => $account['id'], 'month' => $month, 'cost' => $costs[$month] ?? '0', 'credit' => $credits[$month] ?? '0', 'unit' => 'USD'], $months);
        });
    }

}
