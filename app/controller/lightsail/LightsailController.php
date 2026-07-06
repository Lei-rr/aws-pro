<?php

declare(strict_types=1);

namespace app\controller\lightsail;

use app\controller\concerns\ResolvesAccountRegion;
use app\controller\concerns\ResolvesQueryParams;
use app\service\account\AccountService;
use app\service\lightsail\LightsailService;
use app\support\ApiResponse;
use think\Response;

class LightsailController
{
    use ResolvesAccountRegion;
    use ResolvesQueryParams;

    public function __construct(
        private readonly AccountService $accounts,
        private readonly LightsailService $lightsail,
    ) {
    }

    public function instances(): Response
    {
        return ApiResponse::data($this->lightsail->listCached(
            $this->stringQuery('account_id'),
            $this->stringQuery('region')
        ));
    }

    public function sync(): Response
    {
        [$account, $accountId, $region] = $this->accountRegion();

        return ApiResponse::data($this->lightsail->sync($account, $accountId, $region));
    }

    public function createOptions(): Response
    {
        [$account, , $region] = $this->accountRegion();

        return ApiResponse::data($this->lightsail->createOptions($account, $region));
    }

    public function store(): Response
    {
        [$account, $accountId, $region] = $this->accountRegion();
        $this->lightsail->createInstance($account, $region, input('post.', []));
        // 创建后自动同步，将新实例写入数据库并加载到缓存中
        $this->lightsail->sync($account, $accountId, $region);

        return ApiResponse::data(['message' => '实例已创建']);
    }

    public function remark(string $instance): Response
    {
        [, $accountId, $region] = $this->accountRegion();

        return ApiResponse::data($this->lightsail->updateRemark(
            $accountId,
            $region,
            $instance,
            (string) input('put.remark', '')
        ));
    }

    public function action(string $instance): Response
    {
        [$account, , $region] = $this->accountRegion();

        return ApiResponse::data(['message' => $this->lightsail->runAction(
            $account,
            $region,
            $instance,
            input('post.', [])
        )]);
    }

}
