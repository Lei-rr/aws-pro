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

        $awsException = self::awsException($exception);
        if ($awsException !== null) {
            return new ApiException($awsException->getAwsErrorMessage() ?: 'AWS request failed', $awsException->getStatusCode() ?: 502, 'aws_request_failed', [
                'operation' => $operation,
                'aws_error_code' => (string) $awsException->getAwsErrorCode(),
                'aws_request_id' => $awsException->getAwsRequestId(),
            ]);
        }

        $message = $exception->getMessage() !== '' ? $exception->getMessage() : 'AWS request failed';

        return new ApiException($message, 502, 'aws_request_failed', [
            'operation' => $operation,
            'reason' => $message,
        ]);
    }

    private static function awsException(Throwable $exception): ?AwsException
    {
        do {
            if ($exception instanceof AwsException) {
                return $exception;
            }
            $exception = $exception->getPrevious();
        } while ($exception !== null);

        return null;
    }
}
