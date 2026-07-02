<?php

declare(strict_types=1);

namespace app\controller\system;

use app\exception\ApiException;
use app\repository\AwsConfigRepository;
use app\support\ApiResponse;
use think\Response;

class ConfigController
{
    public function __construct(private readonly AwsConfigRepository $config)
    {
    }

    public function index(): Response
    {
        $type = trim((string) input('get.type', 'all'));
        if ($type === 'regions') {
            return ApiResponse::data($this->config->get('regions', []));
        }
        if ($type === 'blueprints') {
            return ApiResponse::data($this->config->get('blueprints', []));
        }
        if ($type === 'all') {
            return ApiResponse::data(['regions' => $this->config->get('regions', []), 'blueprints' => $this->config->get('blueprints', [])]);
        }

        throw new ApiException('Invalid config type', 404, 'config_type_invalid', ['type' => $type]);
    }
}
