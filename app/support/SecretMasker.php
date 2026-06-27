<?php

declare(strict_types=1);

namespace app\support;

class SecretMasker
{
    public static function mask(?string $value, int $prefix = 4, int $suffix = 4): string
    {
        $value = trim((string) $value);
        if ($value === '') {
            return '-';
        }

        $length = strlen($value);
        if ($length <= $prefix + $suffix) {
            return str_repeat('*', min($length, 8));
        }

        return substr($value, 0, $prefix) . '****' . substr($value, -$suffix);
    }
}
