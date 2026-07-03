<?php

declare(strict_types=1);

namespace app\service\region;

use app\exception\ApiException;
use app\repository\AwsConfigRepository;
use app\service\account\AccountService;
use app\service\aws\RegionProvider;
use app\service\concerns\AwsServiceConcern;
use app\support\AwsValidator;

class RegionService
{
    use AwsServiceConcern;

    public function __construct(
        private readonly RegionProvider $provider,
        private readonly AccountService $accounts,
        private readonly AwsConfigRepository $config,
    ) {
    }

    /**
     * 处理 Region 请求参数：必填校验 + account_id/region 格式化
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

    /**
     * 返回系统中已配置的 region 映射表（region => name）
     */
    public function configuredRegions(): array
    {
        $regions = $this->config->get('regions', []);

        return is_array($regions) ? $regions : [];
    }

    /**
     * 获取账号下已启用且在配置白名单中的 region 列表
     */
    public function list(string $accountId, bool $refresh = false, bool $cacheOnly = false): array
    {
        $accountId = AwsValidator::accountId($accountId);
        $account = $this->accounts->requireAccount($accountId);
        $configured = $this->configuredRegions();

        $cacheKey = $this->buildCacheKey('aws:regions', [
            'account_id' => $accountId,
        ]);

        $cached = $this->getCached($cacheKey, $refresh);
        if ($cached !== null) {
            return [
                'items' => array_values(array_filter(
                $cached,
                static fn (array $region): bool => array_key_exists((string) ($region['region'] ?? ''), $configured)
                )),
                'meta' => $this->responseMeta(true, 'cache'),
            ];
        }

        if ($cacheOnly) {
            return ['items' => [], 'meta' => $this->responseMeta(true, 'cache')];
        }

        $regions = $this->provider->regions($account);

        $this->setCached($cacheKey, $regions, [
            $this->providerCacheTag($accountId),
            $this->regionCacheTag($accountId),
        ]);

        return [
            'items' => array_values(array_filter(
            $regions,
            static fn (array $region): bool => array_key_exists((string) ($region['region'] ?? ''), $configured)
            )),
            'meta' => $this->responseMeta(false, 'aws'),
        ];
    }

    public function enable(array $body): array
    {
        $normalized = $this->normalizeData($body);

        if (!array_key_exists($normalized['region'], $this->configuredRegions())) {
            throw new ApiException('Region is not configured', 422, 'region_not_configured', ['region' => $normalized['region']]);
        }

        $account = $this->accounts->requireAccount($normalized['account_id']);

        $result = $this->provider->enable($account, $normalized['region']);

        $this->invalidateCache($this->regionCacheTag($normalized['account_id']));

        return $result;
    }

    private function regionCacheTag(string $accountId): string
    {
        return $this->buildCacheTag('aws', 'regions', $accountId);
    }
}
