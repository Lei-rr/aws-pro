<?php

return [
    'cache_ttl' => 259200, // 3天

    /**
     * Provider 失效时需要清理的 cache tag 前缀清单
     *
     * tag 支持 {providerId} 占位符。
     * 新增 AWS 模块时只需在此追加对应 tag prefix，无需修改清理逻辑。
     */
    'provider_cache_tags' => [
        'lightsail',
        'lightsail:{providerId}',
        'provider:{providerId}',
        'ec2',
        'ec2:{providerId}',
        'lightsail:bundles:{providerId}',
        'lightsail:bundles:{providerId}:*',
        'aws:regions:{providerId}',
        'aws:billing:{providerId}',
        'aws:quota:{providerId}',
        'aws:quota:{providerId}:*',
    ],
];
