<?php

declare(strict_types=1);

namespace app\repository;

use app\support\JsonStore;

/**
 * AWS 账号数据访问层
 *
 * 单一存储后端：data/accounts.json，结构 {"items": [{id, access_key, secret_key, remark}]}。
 * 数组顺序即显示顺序（saveAll 时按传入顺序写入）。单用户场景，无 user_id 分区。
 */
class AccountRepository
{
    private readonly JsonStore $store;

    public function __construct(?JsonStore $store = null)
    {
        $this->store = $store ?? new JsonStore('accounts.json', ['items' => []]);
    }

    public function all(): array
    {
        $data = $this->store->read();
        $items = is_array($data['items'] ?? null) ? $data['items'] : [];

        return array_map(static fn (array $row): array => [
            'id' => (string) ($row['id'] ?? ''),
            'access_key' => (string) ($row['access_key'] ?? ''),
            'secret_key' => (string) ($row['secret_key'] ?? ''),
            'remark' => (string) ($row['remark'] ?? ''),
        ], array_values($items));
    }

    public function find(string $id): ?array
    {
        foreach ($this->all() as $account) {
            if ((string) ($account['id'] ?? '') === $id) {
                return $account;
            }
        }

        return null;
    }

    public function saveAll(array $accounts): void
    {
        $now = time();
        $items = [];
        foreach (array_values($accounts) as $index => $account) {
            $items[] = [
                'id' => (string) ($account['id'] ?? ''),
                'access_key' => (string) ($account['access_key'] ?? ''),
                'secret_key' => (string) ($account['secret_key'] ?? ''),
                'remark' => (string) ($account['remark'] ?? ''),
                'sort_order' => $index,
                'created_at' => (int) ($account['created_at'] ?? $now),
                'updated_at' => $now,
            ];
        }

        $this->store->transaction(static function (array $current) use ($items): array {
            $current['items'] = $items;

            return $current;
        });
    }
}
