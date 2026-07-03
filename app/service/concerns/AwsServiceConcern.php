<?php

declare(strict_types=1);

namespace app\service\concerns;

use think\facade\Cache;

/**
 * AWS 服务通用特性
 *
 * 提供缓存操作和通用辅助方法
 */
trait AwsServiceConcern
{
    protected function cacheTtl(): int
    {
        return (int) config('services.cache_ttl');
    }

    protected function buildCacheKey(string $prefix, array $parts): string
    {
        ksort($parts);
        return $prefix . ':' . md5(json_encode($parts, JSON_UNESCAPED_UNICODE));
    }

    protected function buildCacheTag(string ...$segments): string
    {
        return implode(':', array_filter($segments, fn ($s) => $s !== ''));
    }

    protected function providerCacheTag(string $accountId): string
    {
        return $this->buildCacheTag('provider', $accountId);
    }

    protected function getCached(string $cacheKey, bool $refresh): ?array
    {
        if ($refresh) {
            return null;
        }

        $cached = Cache::get($cacheKey);

        return is_array($cached) ? $cached : null;
    }

    protected function setCached(string $cacheKey, array $data, string|array $tag): void
    {
        Cache::tag($tag)->set($cacheKey, $data, $this->cacheTtl());
    }

    protected function responseMeta(bool $cached, string $source): array
    {
        return [
            'cached' => $cached,
            'source' => $source,
            'refreshed_at' => time(),
        ];
    }

    protected function wildcardCacheTag(string ...$segments): string
    {
        $segments[] = '*';

        return $this->buildCacheTag(...$segments);
    }

    protected function invalidateCache(string ...$tags): void
    {
        foreach ($tags as $tag) {
            if ($tag !== '') {
                Cache::tag($tag)->clear();
            }
        }
    }

}
