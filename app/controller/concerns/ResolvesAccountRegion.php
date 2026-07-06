<?php

declare(strict_types=1);

namespace app\controller\concerns;

use app\exception\ApiException;
use app\support\AwsValidator;

trait ResolvesAccountRegion
{
    protected function accountRegion(): array
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
