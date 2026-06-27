<?php

declare(strict_types=1);

namespace app\controller\billing;

use app\service\billing\BillingService;
use app\support\ApiResponse;
use think\Response;

class BillingController
{
    public function __construct(private readonly BillingService $billing)
    {
    }

    public function yearly(): Response
    {
        return ApiResponse::data($this->billing->yearlySummary(
            input('post.', []),
            (bool) input('post.refresh', false),
            (bool) input('post.cache_only', false)
        ));
    }
}
