<?php

declare(strict_types=1);

namespace app\service\quota;

use app\service\account\AccountService;
use app\service\aws\QuotaProvider;
use app\service\concerns\AwsServiceConcern;
use app\support\AwsValidator;

class QuotaService
{
    use AwsServiceConcern;

    public function __construct(
        private readonly QuotaProvider $provider,
        private readonly AccountService $accounts,
    ) {
    }

    /**
     * 处理配额请求参数：必填校验 + account_id/region 格式化
     *
     * @return array{account_id: string, region: string}
     */
    public function normalizeData(array $data): array
    {
        AwsValidator::required($data, ['account_id', 'region']);

        return [
            'account_id' => AwsValidator::accountId((string) $data['account_id']),
            'region' => AwsValidator::region((string) $data['region']),
        ];
    }

    public function vcpuQuota(array $body, bool $refresh = false, bool $cacheOnly = false): array
    {
        $normalized = $this->normalizeData($body);
        $account = $this->accounts->requireAccount($normalized['account_id']);

        $cacheKey = $this->buildCacheKey('aws:quota:vcpu', [
            'account_id' => $normalized['account_id'],
            'region' => $normalized['region'],
        ]);

        $cached = $this->getCached($cacheKey, $refresh);
        if ($cached !== null) {
            return $cached;
        }

        if ($cacheOnly) {
            return [];
        }

        $result = $this->provider->vcpuQuota($account, $normalized['region']);

        $this->setCached($cacheKey, $result, [
            $this->providerCacheTag($normalized['account_id']),
            $this->quotaAccountCacheTag($normalized['account_id']),
            $this->quotaCacheTag($normalized['account_id'], $normalized['region']),
            $this->quotaWildcardCacheTag($normalized['account_id']),
        ]);

        return $result;
    }

    private function quotaAccountCacheTag(string $accountId): string
    {
        return $this->buildCacheTag('aws', 'quota', $accountId);
    }

    private function quotaCacheTag(string $accountId, string $region): string
    {
        return $this->buildCacheTag('aws', 'quota', $accountId, $region);
    }

    private function quotaWildcardCacheTag(string $accountId): string
    {
        return $this->wildcardCacheTag('aws', 'quota', $accountId);
    }
}
