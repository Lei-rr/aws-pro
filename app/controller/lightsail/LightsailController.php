<?php

declare(strict_types=1);

namespace app\controller\lightsail;

use app\exception\ApiException;
use app\service\account\AccountService;
use app\service\lightsail\LightsailService;
use app\support\ApiResponse;
use app\support\AwsValidator;
use think\Response;

class LightsailController
{
    public function __construct(
        private readonly AccountService $accounts,
        private readonly LightsailService $lightsail,
    ) {
    }

    public function instances(): Response
    {
        return ApiResponse::data($this->lightsail->listCached(
            input('get.account_id'),
            input('get.region')
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

    private function accountRegion(): array
    {
        $accountId = trim((string) (input('post.account_id', '') ?: input('put.account_id', '') ?: input('get.account_id', '')));
        $region = trim((string) (input('post.region', '') ?: input('put.region', '') ?: input('get.region', '')));
        if ($accountId === '' || $region === '') {
            throw new ApiException('account_id and region are required', 422, 'field_required', ['fields' => ['account_id', 'region']]);
        }

        $accountId = AwsValidator::accountId($accountId);
        $region = AwsValidator::region($region);

        return [$this->accounts->requireAccount($accountId), $accountId, $region];
    }
}
