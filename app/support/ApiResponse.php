<?php

declare(strict_types=1);

namespace app\support;

use think\Response;

class ApiResponse
{
    public static function data(mixed $data = null, int $status = 200): Response
    {
        return json(['data' => $data], $status);
    }

    public static function noContent(): Response
    {
        return response('', 204);
    }

    public static function error(string $message, int $status, string $code, array $details = []): Response
    {
        return json([
            'message' => $message,
            'code' => $code,
            'status' => $status,
            'details' => $details,
        ], $status);
    }
}
