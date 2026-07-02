<?php

declare(strict_types=1);

namespace app\repository;

use app\support\JsonStore;

/**
 * AWS 应用设置数据访问层
 *
 * 单一存储后端：data/app-config.json，结构：
 *   {
 *     "regions":   { "<region>": "<name>", ... },
 *     "blueprints":{ "<blueprint>": "<name>", ... }
 *   }
 *
 * 只读：regions / blueprints 为预置配置，直接手动维护 data/app-config.json，
 * 应用内不提供写接口。
 */
class AwsConfigRepository
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
}
