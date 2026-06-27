<?php

declare(strict_types=1);

namespace app\support;

use app\exception\ApiException;

/**
 * 应用配置（data/config.json）
 *
 * 当前用于鉴权用户名/密码（明文，本系统单用户场景）。
 * 通过 JsonStore 只读读取，进程内缓存，避免每次 session 校验都读盘。
 *
 * 注意：data/config.json 不会自动创建，凭据也不可在线修改。
 * 文件缺失或凭据为空时直接禁止登录，需手动按 data/config.json.example 创建/修改。
 */
class AppConfig
{
    private ?array $cache = null;

    public function __construct(private readonly JsonStore $store = new JsonStore('config.json', [
        'auth' => ['username' => '', 'password' => ''],
    ])) {
    }

    public function authUsername(): string
    {
        return (string) ($this->auth()['username'] ?? '');
    }

    public function authPassword(): string
    {
        return (string) ($this->auth()['password'] ?? '');
    }

    /**
     * 严格凭据校验：用户名+密码完全匹配 config.json 中的明文，且不允许空密码。
     *
     * 文件缺失/凭据为空时抛 ApiException，直接禁止登录（不自动创建）。
     */
    public function verifyCredentials(string $username, string $password): bool
    {
        $expectedUser = $this->authUsername();
        $expectedPass = $this->authPassword();

        if ($expectedUser === '' || $expectedPass === '') {
            throw new ApiException(
                '登录凭据未配置：请创建 data/config.json 并填写 auth.username 与 auth.password',
                503,
                'auth_not_configured'
            );
        }

        return hash_equals($expectedUser, $username) && hash_equals($expectedPass, $password);
    }

    /**
     * @return array{username:string, password:string}
     */
    private function auth(): array
    {
        if ($this->cache === null) {
            $config = $this->store->read();
            $this->cache = is_array($config['auth'] ?? null) ? $config['auth'] : [];
        }

        return $this->cache;
    }
}
