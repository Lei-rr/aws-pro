<?php

declare(strict_types=1);

namespace app\service\aws;

use Throwable;

class AwsRetry
{
    public static function run(string $action, callable $callback, array $successCodes = []): mixed
    {
        $last = null;
        for ($attempt = 0; $attempt < 5; $attempt++) {
            try {
                return $callback();
            } catch (Throwable $exception) {
                if (self::isAwsError($exception, $successCodes)) {
                    return null;
                }
                $last = $exception;
                if (!self::isRetryableAwsError($exception) || $attempt === 4) {
                    break;
                }
                usleep((int) (400000 * (1 + $attempt * 0.5)));
            }
        }

        throw new \RuntimeException($action . ' failed: ' . ($last?->getMessage() ?? 'unknown error'), 0, $last);
    }

    public static function isAwsError(Throwable $exception, array $codes): bool
    {
        return method_exists($exception, 'getAwsErrorCode') && in_array((string) $exception->getAwsErrorCode(), $codes, true);
    }

    private static function isRetryableAwsError(Throwable $exception): bool
    {
        if (method_exists($exception, 'getStatusCode') && (int) $exception->getStatusCode() >= 500) {
            return true;
        }
        $code = method_exists($exception, 'getAwsErrorCode') ? (string) $exception->getAwsErrorCode() : '';

        return in_array($code, [
            'RequestLimitExceeded',
            'Throttling',
            'ThrottlingException',
            'ThrottledException',
            'TooManyRequests',
            'TooManyRequestsException',
            'ProvisionedThroughputExceededException',
            'SlowDown',
            'ServiceUnavailable',
            'ServiceUnavailableException',
            'InternalError',
        ], true);
    }
}
