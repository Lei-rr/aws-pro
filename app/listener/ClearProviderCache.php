<?php

declare(strict_types=1);

namespace app\listener;

use app\event\ProviderUpdatedEvent;
use think\facade\Cache;

class ClearProviderCache
{
    public function handle(ProviderUpdatedEvent $event): void
    {
        Cache::tag('provider:' . $event->userId . ':' . $event->providerId)->clear();
        Cache::tag('lightsail:' . $event->userId)->clear();
        Cache::tag('lightsail:' . $event->userId . ':' . $event->providerId)->clear();
        Cache::tag('aws:regions:' . $event->userId . ':' . $event->providerId)->clear();
        Cache::tag('aws:billing:' . $event->userId . ':' . $event->providerId)->clear();
        Cache::tag('aws:quota:' . $event->userId . ':' . $event->providerId)->clear();
    }
}
