<?php

declare(strict_types=1);

namespace app\service;

use app\exception\ApiException;
use app\support\AppConfig;
use app\support\AuthSession;

/**
 * 用户会话服务
 *
 * 凭据来源：data/config.json 的 auth.username / auth.password（明文）。
 * 单用户场景，无需注册；支持在线修改用户名/密码（写回 config.json）。
 *
 * 登录失败一次后强制要求验证码，验证失败/未带都会保持 captcha_required 直到登录成功。
 */
class SessionService
{
    public function __construct(private readonly AppConfig $config)
    {
    }

    /**
     * 用户登录
     *
     * @throws ApiException
     */
    public function login(string $username, string $password, ?string $captcha = null): array
    {
        if (AuthSession::captchaRequired()) {
            if ($captcha === null || $captcha === '') {
                throw new ApiException('Captcha required', 422, 'captcha_required', [
                    'captcha_required' => true,
                ]);
            }

            if (!captcha_check($captcha)) {
                throw new ApiException('Invalid captcha', 422, 'invalid_captcha', [
                    'captcha_required' => true,
                ]);
            }
        }

        if (!$this->config->verifyCredentials($username, $password)) {
            AuthSession::requireCaptcha();

            throw new ApiException('Invalid username or password', 401, 'invalid_credentials', [
                'captcha_required' => true,
            ]);
        }

        AuthSession::signIn($username);

        return $this->currentSession();
    }

    /**
     * 登出
     */
    public function logout(): void
    {
        AuthSession::signOut();
    }

    /**
     * 获取当前会话状态
     */
    public function currentSession(): array
    {
        return [
            'authenticated' => AuthSession::signedIn(),
            'user_id' => AuthSession::userId(),
            'username' => AuthSession::username(),
            'captcha_required' => AuthSession::captchaRequired(),
        ];
    }

    /**
     * 更新当前用户资料（用户名 + 可选的新密码），明文写回 data/config.json
     *
     * @throws ApiException
     */
    public function updateCurrentUser(string $nextUsername, string $currentPassword, ?string $newPassword): array
    {
        $currentUsername = AuthSession::username() ?? $this->config->authUsername();

        if (!$this->config->verifyCredentials($currentUsername, $currentPassword)) {
            throw new ApiException('Invalid current password', 422, 'invalid_current_password');
        }

        $nextUsername = trim($nextUsername);
        if ($nextUsername === '') {
            throw new ApiException('Username is required', 422, 'field_required', ['field' => 'username']);
        }

        $nextPassword = is_string($newPassword) && $newPassword !== ''
            ? $newPassword
            : $this->config->authPassword();

        $this->config->updateCredentials($nextUsername, $nextPassword);

        AuthSession::signIn($nextUsername);

        return $this->currentSession();
    }
}
