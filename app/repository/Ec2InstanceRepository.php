<?php

declare(strict_types=1);

namespace app\repository;

use app\support\JsonStore;

class Ec2InstanceRepository
{
    private readonly JsonStore $store;

    public function __construct(?JsonStore $store = null)
    {
        $this->store = $store ?? new JsonStore('ec2-instances.json', ['items' => []]);
    }

    public function all(): array
    {
        $data = $this->store->read();
        $items = is_array($data['items'] ?? null) ? $data['items'] : [];

        return array_map(static fn (array $row): array => [
            'account_id' => (string) ($row['account_id'] ?? ''),
            'region' => (string) ($row['region'] ?? ''),
            'id' => (string) ($row['id'] ?? ''),
            'name' => (string) ($row['name'] ?? ''),
            'state' => (string) ($row['state'] ?? ''),
            'instance_type' => (string) ($row['instance_type'] ?? ''),
            'public_ipv4' => (string) ($row['public_ipv4'] ?? ''),
            'public_ipv6' => (string) ($row['public_ipv6'] ?? ''),
            'private_ipv4' => (string) ($row['private_ipv4'] ?? ''),
            'zone' => (string) ($row['zone'] ?? ''),
            'launched_at' => (string) ($row['launched_at'] ?? ''),
        ], array_values($items));
    }

    public function replaceScope(string $accountId, string $region, array $synced): void
    {
        $instances = array_filter($this->all(), static fn (array $instance): bool => (string) ($instance['account_id'] ?? '') !== $accountId || (string) ($instance['region'] ?? '') !== $region);
        $this->saveAll(array_merge($instances, $synced));
    }

    public function deleteInstance(string $accountId, string $region, string $id): void
    {
        $this->saveAll(array_filter($this->all(), static fn (array $instance): bool => (string) ($instance['account_id'] ?? '') !== $accountId || (string) ($instance['region'] ?? '') !== $region || (string) ($instance['id'] ?? '') !== $id));
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
                'id' => (string) ($instance['id'] ?? ''),
                'name' => (string) ($instance['name'] ?? ''),
                'state' => (string) ($instance['state'] ?? ''),
                'instance_type' => (string) ($instance['instance_type'] ?? ''),
                'public_ipv4' => (string) ($instance['public_ipv4'] ?? ''),
                'public_ipv6' => (string) ($instance['public_ipv6'] ?? ''),
                'private_ipv4' => (string) ($instance['private_ipv4'] ?? ''),
                'zone' => (string) ($instance['zone'] ?? ''),
                'launched_at' => (string) ($instance['launched_at'] ?? ''),
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
