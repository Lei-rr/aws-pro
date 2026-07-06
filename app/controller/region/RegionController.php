<?php

declare(strict_types=1);

namespace app\controller\region;

use app\controller\concerns\ResolvesQueryParams;
use app\service\region\RegionService;
use app\support\ApiResponse;
use think\Response;

class RegionController
{
    use ResolvesQueryParams;

    public function __construct(private readonly RegionService $regions)
    {
    }

    public function index(): Response
    {
        return ApiResponse::data($this->regions->list(
            $this->stringQuery('account_id'),
            $this->boolQuery('refresh'),
            $this->boolQuery('cache_only')
        ));
    }

    public function enable(): Response
    {
        return ApiResponse::data($this->regions->enable(input('post.', [])));
    }
}
