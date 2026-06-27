<?php

declare(strict_types=1);

namespace app\validate;

use think\Validate;

class SessionValidate extends Validate
{
    protected $rule = [
        'username' => 'require|string|max:64',
        'password' => 'require|string|min:8|max:128|regex:^\\S+$',
        'captcha' => 'string|max:16',
        'current_password' => 'require|string|min:8|max:128|regex:^\\S+$',
        'new_password' => 'string|min:8|max:128|regex:^\\S+$',
    ];

    protected $field = [
        'username' => '用户名',
        'password' => '密码',
        'captcha' => '验证码',
        'current_password' => '当前密码',
        'new_password' => '新密码',
    ];

    protected $message = [
        'password.regex' => '密码不能包含空格',
        'current_password.regex' => '当前密码不能包含空格',
        'new_password.regex' => '新密码不能包含空格',
    ];

    protected $scene = [
        'login' => ['username', 'password', 'captcha'],
        'user' => ['username', 'current_password', 'new_password'],
    ];

    public function sceneUser(): self
    {
        return $this->only(['username', 'current_password', 'new_password']);
    }
}
