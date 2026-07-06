<?php

declare(strict_types=1);

namespace app\controller\ec2;

use app\controller\concerns\ResolvesAccountRegion;
use app\controller\concerns\ResolvesQueryParams;
use app\service\account\AccountService;
use app\service\ec2\Ec2Service;
use app\support\ApiResponse;
use think\Response;

class Ec2Controller
{
    use ResolvesAccountRegion;
    use ResolvesQueryParams;

    public function __construct(
        private readonly AccountService $accounts,
        private readonly Ec2Service $ec2,
    ) {
    }

    public function instances(): Response
    {
        return ApiResponse::data($this->ec2->listCached($this->stringQuery('account_id'), $this->stringQuery('region')));
    }

    public function sync(): Response
    {
        [$account, $accountId, $region] = $this->accountRegion();

        return ApiResponse::data($this->ec2->sync($account, $accountId, $region));
    }

    public function options(): Response
    {
        return ApiResponse::data($this->ec2->options());
    }

    public function store(): Response
    {
        [$account, $accountId, $region] = $this->accountRegion();
        $this->ec2->createInstance($account, $region, input('post.', []));
        $this->ec2->sync($account, $accountId, $region);

        return ApiResponse::data(['message' => 'EC2 实例已创建']);
    }

    public function action(string $instance): Response
    {
        [$account, , $region] = $this->accountRegion();

        return ApiResponse::data(['message' => $this->ec2->runAction($account, $region, $instance, input('post.', []))]);
    }

    public function remark(string $instance): Response
    {
        [, $accountId, $region] = $this->accountRegion();

        return ApiResponse::data($this->ec2->updateRemark($accountId, $region, $instance, (string) input('put.remark', '')));
    }

}
