<?php

declare(strict_types=1);

namespace app\controller\quota;

use app\controller\concerns\ResolvesQueryParams;
use app\service\quota\QuotaService;
use app\support\ApiResponse;
use think\Response;

class QuotaController
{
    use ResolvesQueryParams;

    public function __construct(private readonly QuotaService $quota)
    {
    }

    public function vcpu(): Response
    {
        return ApiResponse::data($this->quota->vcpuQuota(
            input('post.', []),
            $this->boolPost('refresh'),
            $this->boolPost('cache_only')
        ));
    }
}
