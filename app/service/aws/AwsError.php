<?php

declare(strict_types=1);

namespace app\service\aws;

use app\exception\ApiException;
use Aws\Exception\AwsException;
use Throwable;

class AwsError
{
    public static function convert(Throwable $exception, string $operation): ApiException
    {
        if ($exception instanceof ApiException) {
            return $exception;
        }

        if (!$exception instanceof AwsException) {
            $message = $exception->getMessage() !== '' ? $exception->getMessage() : 'AWS request failed';

            return new ApiException($message, 502, 'aws_request_failed', [
                'operation' => $operation,
                'reason' => $message,
            ]);
        }

        return new ApiException($exception->getAwsErrorMessage() ?: 'AWS request failed', $exception->getStatusCode() ?: 502, 'aws_request_failed', [
            'operation' => $operation,
            'aws_error_code' => (string) $exception->getAwsErrorCode(),
            'aws_request_id' => $exception->getAwsRequestId(),
        ]);
    }
}
