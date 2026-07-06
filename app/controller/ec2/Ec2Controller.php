<?php

declare(strict_types=1);

namespace app\controller\ec2;

use app\exception\ApiException;
use app\service\account\AccountService;
use app\service\ec2\Ec2Service;
use app\support\ApiResponse;
use app\support\AwsValidator;
use think\Response;

class Ec2Controller
{
    public function __construct(
        private readonly AccountService $accounts,
        private readonly Ec2Service $ec2,
    ) {
    }

    public function instances(): Response
    {
        return ApiResponse::data($this->ec2->listCached(input('get.account_id'), input('get.region')));
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
