<?php

declare(strict_types=1);

namespace app\service\concerns;

use app\exception\ApiException;
use Aws\Exception\AwsException;

/**
 * AWS SDK 异常处理特性
 *
 * 统一将 AWS SDK 异常转换为 ApiException
 */
trait AwsSdkExceptionConcern
{
    /**
     * 将 AWS SDK 异常转换为 ApiException
     */
    protected function wrapAwsException(
        string $message,
        string $code,
        AwsException $exception,
        array $details = [],
    ): ApiException {
        return new ApiException($message, 502, $code, $details + [
            'aws_code' => $exception->getAwsErrorCode(),
            'aws_message' => $exception->getAwsErrorMessage(),
            'request_id' => $exception->getAwsRequestId(),
        ]);
    }
}
