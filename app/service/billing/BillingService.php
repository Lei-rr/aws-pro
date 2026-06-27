<?php

declare(strict_types=1);

namespace app\service\billing;

use app\service\account\AccountService;
use app\service\aws\BillingProvider;
use app\service\concerns\AwsServiceConcern;
use app\support\AuthSession;
use app\support\AwsValidator;

class BillingService
{
    use AwsServiceConcern;

    public function __construct(
        private readonly AccountService $accounts,
        private readonly BillingProvider $billing,
    ) {
    }

    /**
     * 处理列表查询参数：trim + account_id 校验
     *
     * @return array{account_id: string|null}
     */
    public function listFilters(array $filters): array
    {
        $accountId = trim((string) ($filters['account_id'] ?? ''));

        return [
            'account_id' => $accountId !== '' ? AwsValidator::accountId($accountId) : null,
        ];
    }

    /**
     * 年度成本与积分汇总
     *
     * 包含参数校验、数据拉取、总值聚合
     */
    public function yearlySummary(array $body, bool $refresh = false, bool $cacheOnly = false): array
    {
        AwsValidator::required($body, ['account_id']);
        $accountId = AwsValidator::accountId((string) $body['account_id']);
        $account = $this->accounts->requireAccount($accountId);

        $userId = (string) (AuthSession::userId() ?? 0);

        $cacheKey = $this->buildCacheKey('aws:billing:yearly', [
            'user_id' => $userId,
            'account_id' => $accountId,
        ]);

        $cached = $this->getCached($cacheKey, $refresh);
        if ($cached !== null) {
            return $cached;
        }

        if ($cacheOnly) {
            return ['items' => [], 'total_cost' => 0, 'total_credit' => 0, 'unit' => 'USD'];
        }

        $items = $this->billing->yearlyCostAndCredits($account);

        $result = $this->formatYearlySummary($items);

        $this->setCached($cacheKey, $result, [
            $this->providerCacheTag($accountId),
            $this->billingCacheTag($accountId),
        ]);

        return $result;
    }

    private function formatYearlySummary(array $items): array
    {
        $totalCost = 0.0;
        $totalCredit = 0.0;
        foreach ($items as $item) {
            $totalCost += (float) ($item['cost'] ?? 0);
            $totalCredit += (float) ($item['credit'] ?? 0);
        }

        return [
            'items' => $items,
            'total_cost' => $totalCost,
            'total_credit' => $totalCredit,
            'unit' => 'USD',
        ];
    }

    private function billingCacheTag(string $accountId): string
    {
        return $this->buildCacheTag('aws', 'billing', (string) (AuthSession::userId() ?? 0), $accountId);
    }
}
