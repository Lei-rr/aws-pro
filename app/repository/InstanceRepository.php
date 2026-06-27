<?php

declare(strict_types=1);

namespace app\repository;

use app\support\JsonStore;

/**
 * Lightsail 实例数据访问层
 *
 * 单一存储后端：data/instances.json，结构 {"items": [{account_id, region, name, ...}]}。
 * 数组顺序即显示顺序。单用户场景，无 user_id 分区。
 */
class InstanceRepository
{
    private readonly JsonStore $store;

    public function __construct(?JsonStore $store = null)
    {
        $this->store = $store ?? new JsonStore('instances.json', ['items' => []]);
    }

    public function all(): array
    {
        $data = $this->store->read();
        $items = is_array($data['items'] ?? null) ? $data['items'] : [];

        return array_map(static fn (array $row): array => [
            'account_id' => (string) ($row['account_id'] ?? ''),
            'region' => (string) ($row['region'] ?? ''),
            'name' => (string) ($row['name'] ?? ''),
            'state' => (string) ($row['state'] ?? ''),
            'public_ip' => (string) ($row['public_ip'] ?? ''),
            'static_ip' => (string) ($row['static_ip'] ?? ''),
            'ipv6' => (string) ($row['ipv6'] ?? ''),
            'zone' => (string) ($row['zone'] ?? ''),
            'bundle_id' => (string) ($row['bundle_id'] ?? ''),
            'remark' => (string) ($row['remark'] ?? ''),
        ], array_values($items));
    }

    public function replaceScope(string $accountId, string $region, array $synced): void
    {
        $instances = array_filter($this->all(), static fn (array $instance): bool => (string) ($instance['account_id'] ?? '') !== $accountId || (string) ($instance['region'] ?? '') !== $region);
        $this->saveAll(array_merge($instances, $synced));
    }

    public function updateRemark(string $accountId, string $region, string $name, string $remark): ?array
    {
        $updated = null;
        $instances = array_map(function (array $instance) use ($accountId, $region, $name, $remark, &$updated): array {
            if ((string) ($instance['account_id'] ?? '') === $accountId && (string) ($instance['region'] ?? '') === $region && (string) ($instance['name'] ?? '') === $name) {
                $instance['remark'] = $remark;
                $updated = $instance;
            }

            return $instance;
        }, $this->all());

        $this->saveAll($instances);

        return $updated;
    }

    public function deleteInstance(string $accountId, string $region, string $name): void
    {
        $this->saveAll(array_filter($this->all(), static fn (array $instance): bool => (string) ($instance['account_id'] ?? '') !== $accountId || (string) ($instance['region'] ?? '') !== $region || (string) ($instance['name'] ?? '') !== $name));
    }

    public function renameAccount(string $from, string $to): void
    {
        $this->saveAll(array_map(static function (array $instance) use ($from, $to): array {
            if ((string) ($instance['account_id'] ?? '') === $from) {
                $instance['account_id'] = $to;
            }

            return $instance;
        }, $this->all()));
    }

    public function deleteByAccount(string $accountId): void
    {
        $this->saveAll(array_filter($this->all(), static fn (array $instance): bool => (string) ($instance['account_id'] ?? '') !== $accountId));
    }

    private function saveAll(array $instances): void
    {
        $now = time();
        $items = [];
        foreach (array_values($instances) as $index => $instance) {
            $items[] = [
                'account_id' => (string) ($instance['account_id'] ?? ''),
                'region' => (string) ($instance['region'] ?? ''),
                'name' => (string) ($instance['name'] ?? ''),
                'state' => (string) ($instance['state'] ?? ''),
                'public_ip' => (string) ($instance['public_ip'] ?? ''),
                'static_ip' => (string) ($instance['static_ip'] ?? ''),
                'ipv6' => (string) ($instance['ipv6'] ?? ''),
                'zone' => (string) ($instance['zone'] ?? ''),
                'bundle_id' => (string) ($instance['bundle_id'] ?? ''),
                'remark' => (string) ($instance['remark'] ?? ''),
                'sort_order' => $index,
                'created_at' => (int) ($instance['created_at'] ?? $now),
                'updated_at' => $now,
            ];
        }

        $this->store->transaction(static function (array $current) use ($items): array {
            $current['items'] = $items;

            return $current;
        });
    }
}
