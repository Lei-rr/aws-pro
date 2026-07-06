<?php

declare(strict_types=1);

namespace app\controller\concerns;

/**
 * 控制器查询参数解析辅助
 *
 * 抽取多个 controller 共用的 query 解析逻辑，避免逐份重复。
 */
trait ResolvesQueryParams
{
    protected function stringQuery(string $key, string $default = ''): string
    {
        $value = input('get.' . $key, $default);

        return trim((string) ($value === null ? $default : $value));
    }

    /**
     * 读取布尔 query 参数
     *
     * 1/true/on/yes → true；0/false/off/no → false；空或其它 → $default
     */
    protected function boolQuery(string $key, bool $default = false): bool
    {
        return $this->boolInput('get', $key, $default);
    }

    protected function boolPost(string $key, bool $default = false): bool
    {
        return $this->boolInput('post', $key, $default);
    }

    protected function boolInput(string $source, string $key, bool $default = false): bool
    {
        $raw = input($source . '.' . $key, null);
        if ($raw === null || $raw === '') {
            return $default;
        }

        if (is_bool($raw)) {
            return $raw;
        }

        $value = strtolower((string) $raw);

        return in_array($value, ['1', 'true', 'on', 'yes'], true) ? true
            : (in_array($value, ['0', 'false', 'off', 'no'], true) ? false : $default);
    }
}
