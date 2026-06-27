<?php
return [
    'bind'      => [
        'ProviderUpdated' => \app\event\ProviderUpdatedEvent::class,
    ],
    'listen'    => [
        'AppInit'         => [],
        'HttpRun'         => [],
        'HttpEnd'         => [],
        'LogLevel'        => [],
        'LogWrite'        => [],
        'ProviderUpdated' => [\app\listener\ClearProviderCache::class],
    ],
    'subscribe' => [],
];
