<?php

declare(strict_types=1);

namespace app\repository;

use app\support\JsonStore;

class NewbieTaskRepository
{
    private readonly JsonStore $store;

    public function __construct(?JsonStore $store = null)
    {
        $this->store = $store ?? new JsonStore('newbie-tasks.json', ['items' => []]);
    }

    public function all(): array
    {
        $data = $this->store->read();
        $items = is_array($data['items'] ?? null) ? $data['items'] : [];

        return array_map(static fn (array $row): array => [
            'id' => (string) ($row['id'] ?? ''),
            'account_id' => (string) ($row['account_id'] ?? ''),
            'region' => (string) ($row['region'] ?? 'us-east-1'),
            'step' => (string) ($row['step'] ?? 'all'),
            'step_label' => (string) ($row['step_label'] ?? '全部任务'),
            'operation_ids' => is_array($row['operation_ids'] ?? null) ? $row['operation_ids'] : [],
            'status' => (string) ($row['status'] ?? 'pending'),
            'message' => (string) ($row['message'] ?? ''),
            'created_at' => (int) ($row['created_at'] ?? 0),
            'updated_at' => (int) ($row['updated_at'] ?? 0),
        ], array_values($items));
    }

    public function find(string $id): ?array
    {
        foreach ($this->all() as $task) {
            if ((string) ($task['id'] ?? '') === $id) {
                return $task;
            }
        }

        return null;
    }

    public function create(string $accountId, string $step, string $stepLabel): ?array
    {
        $now = time();
        $id = bin2hex(random_bytes(8));
        $task = [
            'id' => $id,
            'account_id' => $accountId,
            'region' => 'us-east-1',
            'step' => $step,
            'step_label' => $stepLabel,
            'operation_ids' => [
                'budget' => 'nt-' . $id . '-budget',
                'ec2' => 'nt-' . $id . '-ec2',
                'lambda' => 'nt-' . $id . '-lambda',
                'rds' => 'nt-' . $id . '-rds',
            ],
            'status' => 'pending',
            'message' => '',
            'created_at' => $now,
            'updated_at' => $now,
        ];
        $created = null;
        $this->store->transaction(static function (array $current) use ($task, $now, &$created): array {
            $items = is_array($current['items'] ?? null) ? $current['items'] : [];
            foreach ($items as $item) {
                if (in_array((string) ($item['status'] ?? ''), ['pending', 'running'], true) && $now - (int) ($item['updated_at'] ?? 0) < 7200) {
                    return $current;
                }
            }
            $items[] = $task;
            $current['items'] = array_slice($items, -20);
            $created = $task;

            return $current;
        });

        return $created;
    }

    public function updateStatus(string $id, string $status, string $message = ''): void
    {
        $this->store->transaction(static function (array $current) use ($id, $status, $message): array {
            $items = is_array($current['items'] ?? null) ? $current['items'] : [];
            foreach ($items as &$item) {
                if ((string) ($item['id'] ?? '') === $id) {
                    $item['status'] = $status;
                    $item['message'] = $message;
                    $item['updated_at'] = time();
                    break;
                }
            }
            unset($item);
            $current['items'] = $items;

            return $current;
        });
    }

    public function delete(string $id): void
    {
        $this->store->transaction(static function (array $current) use ($id): array {
            $items = is_array($current['items'] ?? null) ? $current['items'] : [];
            $current['items'] = array_values(array_filter($items, static fn (array $item): bool => (string) ($item['id'] ?? '') !== $id));

            return $current;
        });
    }

}
