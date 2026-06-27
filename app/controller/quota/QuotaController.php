<?php

declare(strict_types=1);

namespace app\controller\quota;

use app\service\quota\QuotaService;
use app\support\ApiResponse;
use think\Response;

class QuotaController
{
    public function __construct(private readonly QuotaService $quota)
    {
    }

    public function vcpu(): Response
    {
        return ApiResponse::data($this->quota->vcpuQuota(
            input('post.', []),
            (bool) input('post.refresh', false),
            (bool) input('post.cache_only', false)
        ));
    }
}
