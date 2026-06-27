<?php

declare(strict_types=1);

namespace app\support;

use app\exception\ApiException;

class AwsValidator
{
    public static function required(array $payload, array $fields): void
    {
        foreach ($fields as $field) {
            if (trim((string) ($payload[$field] ?? '')) === '') {
                throw new ApiException("{$field} is required", 422, 'field_required', ['field' => $field]);
            }
        }
    }

    public static function accountId(string $value): string
    {
        $value = trim($value);
        if ($value === '' || strlen($value) > 128 || preg_match('/^[^\s\/]+$/', $value) !== 1) {
            throw new ApiException('Invalid account id', 422, 'account_id_invalid');
        }

        return $value;
    }

    public static function region(string $value): string
    {
        $value = trim($value);
        if ($value === '' || preg_match('/^[a-z]{2}-[a-z]+-\d+$/', $value) !== 1) {
            throw new ApiException('Invalid region', 422, 'region_invalid');
        }

        return $value;
    }

    public static function instanceName(string $value): string
    {
        $value = trim($value);
        if ($value === '' || strlen($value) > 253 || preg_match('/^[a-z0-9][a-z0-9_-]*$/i', $value) !== 1) {
            throw new ApiException('Invalid instance name', 422, 'instance_name_invalid');
        }

        return $value;
    }
}
