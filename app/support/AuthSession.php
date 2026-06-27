<?php

declare(strict_types=1);

namespace app\support;

use think\facade\Session;

/**
 * 鉴权会话状态
 *
 * 单用户场景下只需记录"已登录"标记 + 用户名展示。
 * 凭据来源：data/config.json 的 auth.username / auth.password（明文，见 AppConfig）。
 * 登录失败时设置 captcha_required，下一次登录必须带验证码（防暴力破解）。
 */
class AuthSession
{
    public const SESSION_KEY = 'auth.signed_in';
    public const USERNAME_KEY = 'auth.username';
    public const CAPTCHA_REQUIRED_KEY = 'auth.captcha_required';

    /**
     * 单用户场景下的固定用户标识，用于缓存命名空间。
     */
    private const SINGLE_USER_ID = 1;

    public static function signedIn(): bool
    {
        return session(self::SESSION_KEY) === true;
    }

    public static function signIn(string $username): void
    {
        Session::regenerate(true);
        session(self::SESSION_KEY, true);
        session(self::USERNAME_KEY, $username);
        self::clearCaptchaRequired();
    }

    public static function signOut(): void
    {
        session(self::SESSION_KEY, null);
        session(self::USERNAME_KEY, null);
    }

    /**
     * 单用户场景：登录后返回固定 ID，用于缓存标签命名空间；未登录返回 null。
     */
    public static function userId(): ?int
    {
        return self::signedIn() ? self::SINGLE_USER_ID : null;
    }

    public static function username(): ?string
    {
        $username = session(self::USERNAME_KEY);

        return is_string($username) && $username !== '' ? $username : null;
    }

    public static function captchaRequired(): bool
    {
        return session('?' . self::CAPTCHA_REQUIRED_KEY);
    }

    public static function requireCaptcha(): void
    {
        session(self::CAPTCHA_REQUIRED_KEY, true);
    }

    public static function clearCaptchaRequired(): void
    {
        session(self::CAPTCHA_REQUIRED_KEY, null);
    }
}
