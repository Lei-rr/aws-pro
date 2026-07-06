<?php

declare(strict_types=1);

namespace app\controller\billing;

use app\controller\concerns\ResolvesQueryParams;
use app\service\billing\BillingService;
use app\support\ApiResponse;
use think\Response;

class BillingController
{
    use ResolvesQueryParams;

    public function __construct(private readonly BillingService $billing)
    {
    }

    public function yearly(): Response
    {
        return ApiResponse::data($this->billing->yearlySummary(
            input('post.', []),
            $this->boolPost('refresh'),
            $this->boolPost('cache_only')
        ));
    }
}
