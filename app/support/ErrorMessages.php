<?php

declare(strict_types=1);

namespace app\support;

/**
 * 错误码 → 中文文案映射
 *
 * 业务代码继续按 error_code 抛 ApiException(英文 code 稳定),
 * 这里集中维护对外可见的中文文案。
 *
 * 约定:
 *   - 文案以用户视角描述"发生了什么";尽量不暴露内部实现
 *   - 文案末尾不加句号
 *   - 如果某个 code 不在表里,返 null,由 ExceptionHandle 回退到原始英文 message
 */
class ErrorMessages
{
    /** @var array<string, string> */
    private const MAP = [
        // 鉴权
        'unauthenticated'      => '请先登录',
        'invalid_credentials'  => '用户名或密码不正确',
        'captcha_required'     => '请输入验证码',
        'invalid_captcha'      => '验证码不正确',
        'auth_not_configured'  => '登录凭据未配置，请在 data/config.json 中设置用户名和密码',

        // 通用
        'validation_failed'    => '参数校验未通过',
        'field_required'       => '必填参数缺失',
        'not_found'            => '接口不存在',
        'http_error'           => '请求失败',
        'server_error'         => '服务内部错误',

        // 账号
        'account_not_found'        => 'AWS 账号不存在',
        'account_already_exists'   => '该 AWS 账号已存在',
        'account_id_invalid'       => 'AWS 账号标识格式不正确',

        // 区域
        'region_invalid'           => '区域格式不正确',
        'region_not_configured'    => '该区域尚未在系统中配置',

        // 配置
        'config_type_invalid'      => '配置类型无效',

        // Lightsail 实例
        'instance_not_found'                  => 'Lightsail 实例不存在',
        'instance_name_invalid'               => 'Lightsail 实例名称格式不正确',
        'lightsail_action_invalid'            => '无效的 Lightsail 操作',
        'lightsail_action_confirm_required'   => '请确认要执行的操作',

        // AWS SDK
        'aws_request_failed'       => 'AWS 请求失败',
    ];

    /**
     * 取错误码对应的中文文案;不存在返 null
     */
    public static function translate(string $code): ?string
    {
        return self::MAP[$code] ?? null;
    }
}
