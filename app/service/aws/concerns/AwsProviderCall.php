<?php

declare(strict_types=1);

namespace app\service\aws\concerns;

use app\service\aws\AwsError;
use Throwable;

trait AwsProviderCall
{
    protected function call(string $operation, callable $callback): mixed
    {
        try {
            return $callback();
        } catch (Throwable $exception) {
            throw AwsError::convert($exception, $operation);
        }
    }
}
