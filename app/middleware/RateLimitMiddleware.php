<?php

declare(strict_types=1);

namespace app\middleware;

use app\exception\ApiException;
use think\facade\Cache;
use Closure;
use think\Request;
use think\Response;

/**
 * 请求频率限制中间件
 *
 * 基于IP的限流防护，防止暴力破解
 */
class RateLimitMiddleware
{
    /**
     * 默认限制：5分钟10次
     */
    private int $maxAttempts = 10;
    private int $decaySeconds = 300;

    public function handle(Request $request, Closure $next): Response
    {
        $key = $this->resolveKey($request);
        $attempts = (int) Cache::get($key, 0);

        if ($attempts >= $this->maxAttempts) {
            $retryAfter = (int) Cache::get($key . ':timer', $this->decaySeconds);
            throw new ApiException(
                'Too many requests, please try again later',
                429,
                'rate_limit_exceeded',
                ['retry_after' => $retryAfter]
            );
        }

        $this->hit($key);

        return $next($request);
    }

    /**
     * 记录一次请求并设置/刷新过期时间
     */
    private function hit(string $key): void
    {
        $attempts = (int) Cache::get($key, 0) + 1;
        Cache::set($key, $attempts, $this->decaySeconds);

        // 只在第一次设置计时器
        if ($attempts === 1) {
            Cache::set($key . ':timer', $this->decaySeconds, $this->decaySeconds);
        }
    }

    /**
     * 基于IP生成限流键
     */
    private function resolveKey(Request $request): string
    {
        return 'rate_limit:' . $request->ip();
    }
}
