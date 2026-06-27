<?php

declare(strict_types=1);

namespace app\service\lightsail;

use app\exception\ApiException;
use app\repository\InstanceRepository;
use app\service\aws\LightsailProvider;
use app\service\concerns\AwsServiceConcern;
use app\support\AuthSession;
use app\support\AwsValidator;

class LightsailService
{
    use AwsServiceConcern;

    public function __construct(
        private readonly LightsailProvider $aws,
        private readonly InstanceRepository $instances,
    ) {
    }

    /**
     * 处理列表查询参数：trim + 可选的 account_id/region 校验
     */
    public function normalizeListFilters(array $filters): array
    {
        $accountId = trim((string) ($filters['account_id'] ?? ''));
        $region = trim((string) ($filters['region'] ?? ''));

        return [
            'account_id' => $accountId !== '' ? AwsValidator::accountId($accountId) : null,
            'region' => $region !== '' ? AwsValidator::region($region) : null,
        ];
    }

    /**
     * 处理创建实例的请求数据：必填校验 + 字段格式化
     */
    public function normalizeCreateOptions(array $data): array
    {
        AwsValidator::required($data, ['name', 'zone', 'blueprint', 'bundle']);

        return [
            'name' => AwsValidator::instanceName((string) $data['name']),
            'zone' => trim((string) $data['zone']),
            'blueprint' => trim((string) $data['blueprint']),
            'bundle' => trim((string) $data['bundle']),
            'root_password' => (string) ($data['root_password'] ?? ''),
        ];
    }

    /**
     * 处理操作参数：校验 action 合法性 + 确认字段
     */
    public function normalizeActionData(array $data): array
    {
        $action = trim((string) ($data['action'] ?? ''));
        $allowed = ['allocate_static_ip', 'release_static_ip', 'start', 'stop', 'reboot', 'delete', 'open_ports'];
        if (!in_array($action, $allowed, true)) {
            throw new ApiException('Invalid Lightsail action', 422, 'lightsail_action_invalid', ['action' => $action]);
        }
        if ((string) ($data['confirm'] ?? '') !== $action) {
            throw new ApiException('Action confirmation is required', 422, 'lightsail_action_confirm_required', ['action' => $action]);
        }

        return ['action' => $action];
    }

    public function createOptions(array $account, string $region): array
    {
        return [
            'zones' => $this->aws->availabilityZones($account, $region),
            'bundles' => $this->aws->bundles($account, $region),
        ];
    }

    public function createInstance(array $account, string $region, array $data): void
    {
        $normalized = $this->normalizeCreateOptions($data);
        $this->aws->createInstance($account, $region, $normalized);
        $this->invalidateLightsailCache((string) $account['id']);
    }

    public function listCached(mixed $accountId = null, mixed $region = null): array
    {
        $filters = $this->normalizeListFilters(['account_id' => $accountId, 'region' => $region]);
        $userId = (string) (AuthSession::userId() ?? 0);

        $cacheKey = $this->buildCacheKey('lightsail.list', [
            'user_id' => $userId,
            'account_id' => (string) ($filters['account_id'] ?? ''),
            'region' => (string) ($filters['region'] ?? ''),
        ]);

        $cached = $this->getCached($cacheKey, false);
        if ($cached !== null) {
            return $cached;
        }

        $items = $this->loadAndSortInstances($filters['account_id'], $filters['region']);
        $this->setCached($cacheKey, $items, $this->lightsailCacheTags($filters['account_id']));

        return $items;
    }

    public function sync(array $account, string $accountId, string $region): array
    {
        $remarks = $this->remarksByInstance($this->instances->all());
        $synced = array_map(function (array $item) use ($remarks): array {
            $key = $this->instanceKey(
                (string) ($item['account_id'] ?? ''),
                (string) ($item['region'] ?? ''),
                (string) ($item['name'] ?? '')
            );
            if (isset($remarks[$key])) {
                $item['remark'] = $remarks[$key];
            }

            return $item;
        }, $this->aws->instances($account, $region));

        $this->instances->replaceScope($accountId, $region, $synced);
        $this->invalidateLightsailCache($accountId);

        return ['instances' => $synced, 'count' => count($synced)];
    }

    public function updateRemark(string $accountId, string $region, string $instanceName, string $remark): array
    {
        $instanceName = AwsValidator::instanceName($instanceName);
        $remark = trim($remark);

        $instance = $this->instances->updateRemark($accountId, $region, $instanceName, $remark);
        if ($instance === null) {
            throw new ApiException('Instance not found', 404, 'instance_not_found', ['instance' => $instanceName]);
        }

        $this->invalidateLightsailCache($accountId);

        return $instance;
    }

    public function runAction(array $account, string $region, string $instanceName, array $input): string
    {
        $normalized = $this->normalizeActionData($input);
        $action = $normalized['action'];
        $instanceName = AwsValidator::instanceName($instanceName);

        match ($action) {
            'allocate_static_ip' => $this->aws->allocateStaticIp($account, $region, $instanceName),
            'release_static_ip' => $this->aws->releaseStaticIp($account, $region, $instanceName),
            'start' => $this->aws->startInstance($account, $region, $instanceName),
            'stop' => $this->aws->stopInstance($account, $region, $instanceName),
            'reboot' => $this->aws->rebootInstance($account, $region, $instanceName),
            'open_ports' => $this->aws->openAllPorts($account, $region, $instanceName),
            'delete' => $this->deleteInstance($account, $region, $instanceName),
            default => throw new ApiException('Invalid Lightsail action', 422, 'lightsail_action_invalid', ['action' => $action]),
        };

        $this->invalidateLightsailCache((string) $account['id']);

        return $action . ' submitted';
    }

    private function loadAndSortInstances(?string $accountId, ?string $region): array
    {
        $items = array_filter($this->instances->all(), static function (array $item) use ($accountId, $region): bool {
            return ($accountId === null || (string) ($item['account_id'] ?? '') === $accountId)
                && ($region === null || (string) ($item['region'] ?? '') === $region);
        });
        usort($items, static fn (array $a, array $b): int => [
            ($a['account_id'] ?? ''), ($a['region'] ?? ''), ($a['name'] ?? ''),
        ] <=> [
            ($b['account_id'] ?? ''), ($b['region'] ?? ''), ($b['name'] ?? ''),
        ]);

        return array_values($items);
    }

    private function deleteInstance(array $account, string $region, string $instanceName): void
    {
        $this->aws->deleteInstance($account, $region, $instanceName);
        $this->instances->deleteInstance((string) $account['id'], $region, $instanceName);
    }

    private function lightsailCacheTag(): string
    {
        return $this->buildCacheTag('lightsail', (string) (AuthSession::userId() ?? 0));
    }

    private function lightsailAccountCacheTag(string $accountId): string
    {
        return $this->buildCacheTag('lightsail', (string) (AuthSession::userId() ?? 0), $accountId);
    }

    private function lightsailCacheTags(?string $accountId): array
    {
        $tags = [$this->lightsailCacheTag()];
        if ($accountId !== null && $accountId !== '') {
            $tags[] = $this->providerCacheTag($accountId);
            $tags[] = $this->lightsailAccountCacheTag($accountId);
        }

        return $tags;
    }

    private function invalidateLightsailCache(string $accountId): void
    {
        $this->invalidateCache(
            $this->providerCacheTag($accountId),
            $this->lightsailCacheTag(),
            $this->lightsailAccountCacheTag($accountId),
        );
    }

    private function remarksByInstance(array $instances): array
    {
        $remarks = [];
        foreach ($instances as $instance) {
            $remark = (string) ($instance['remark'] ?? '');
            if ($remark !== '') {
                $remarks[$this->instanceKey(
                    (string) ($instance['account_id'] ?? ''),
                    (string) ($instance['region'] ?? ''),
                    (string) ($instance['name'] ?? '')
                )] = $remark;
            }
        }

        return $remarks;
    }

    private function instanceKey(string $accountId, string $region, string $name): string
    {
        return $accountId . '|' . $region . '|' . $name;
    }
}
