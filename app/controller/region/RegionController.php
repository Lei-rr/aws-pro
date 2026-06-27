<?php

declare(strict_types=1);

namespace app\controller\region;

use app\service\region\RegionService;
use app\support\ApiResponse;
use think\Response;

class RegionController
{
    public function __construct(private readonly RegionService $regions)
    {
    }

    public function index(): Response
    {
        return ApiResponse::data($this->regions->list(
            (string) input('get.account_id', ''),
            (bool) input('get.refresh', false),
            (bool) input('get.cache_only', false)
        ));
    }

    public function enable(): Response
    {
        return ApiResponse::data($this->regions->enable(input('post.', [])));
    }
}
