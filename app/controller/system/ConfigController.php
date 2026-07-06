<?php

declare(strict_types=1);

namespace app\controller\system;

use app\controller\concerns\ResolvesQueryParams;
use app\exception\ApiException;
use app\repository\AwsConfigRepository;
use app\support\ApiResponse;
use think\Response;

class ConfigController
{
    use ResolvesQueryParams;

    public function __construct(private readonly AwsConfigRepository $config)
    {
    }

    public function index(): Response
    {
        $type = $this->stringQuery('type', 'all');
        if ($type === 'regions') {
            return ApiResponse::data($this->config->get('regions', []));
        }
        if ($type === 'ec2_regions') {
            return ApiResponse::data($this->config->get('ec2_regions', []));
        }
        if ($type === 'blueprints') {
            return ApiResponse::data($this->config->get('blueprints', []));
        }
        if ($type === 'all') {
            return ApiResponse::data([
                'regions' => $this->config->get('regions', []),
                'ec2_regions' => $this->config->get('ec2_regions', []),
                'blueprints' => $this->config->get('blueprints', []),
            ]);
        }

        throw new ApiException('Invalid config type', 404, 'config_type_invalid', ['type' => $type]);
    }
}
