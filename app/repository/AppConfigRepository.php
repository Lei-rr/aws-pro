<?php

declare(strict_types=1);

namespace app\repository;

use app\support\JsonStore;

/**
 * 应用设置数据访问层
 *
 * 单一存储后端：data/app-config.json，结构：
 *   {
 *     "regions":   { "<region>": "<name>", ... }, // 有序映射
 *     "blueprints":{ "<blueprint>": "<name>", ... }
 *   }
 *
 * all() 返回 regions / blueprints 两个键，
 * 兼容调用方（ConfigController / RegionService 通过 get('regions') 等访问）。
 */
class AppConfigRepository
{
    private readonly JsonStore $store;

    public function __construct(?JsonStore $store = null)
    {
        $this->store = $store ?? new JsonStore('app-config.json', [
            'regions' => [],
            'blueprints' => [],
        ]);
    }

    public function all(): array
    {
        $data = $this->store->read();

        return [
            'regions' => is_array($data['regions'] ?? null) ? $data['regions'] : [],
            'blueprints' => is_array($data['blueprints'] ?? null) ? $data['blueprints'] : [],
        ];
    }

    public function get(string $key, mixed $default = null): mixed
    {
        return $this->all()[$key] ?? $default;
    }

    public function save(array $data): void
    {
        $regions = $data['regions'] ?? [];
        $blueprints = $data['blueprints'] ?? [];

        $this->store->transaction(static function (array $current) use ($regions, $blueprints): array {
            $current['regions'] = self::normalizeMap($regions);
            $current['blueprints'] = self::normalizeMap($blueprints);

            return $current;
        });
    }

    private static function normalizeMap(mixed $items): array
    {
        if (!is_array($items)) {
            return [];
        }

        $map = [];
        foreach ($items as $key => $value) {
            $map[(string) $key] = (string) $value;
        }

        return $map;
    }
}
