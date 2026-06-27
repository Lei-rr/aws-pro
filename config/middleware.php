<?php

use app\middleware\AuthRequiredMiddleware;
use app\middleware\RateLimitMiddleware;

return [
    'alias'    => [
        'auth.required' => AuthRequiredMiddleware::class,
        'rate.limit'    => RateLimitMiddleware::class,
    ],
    'priority' => [],
];
