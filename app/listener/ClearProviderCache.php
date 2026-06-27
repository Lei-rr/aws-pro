<?php

declare(strict_types=1);

namespace app\listener;

use app\event\ProviderUpdatedEvent;
use think\facade\Cache;

class ClearProviderCache
{
    public function handle(ProviderUpdatedEvent $event): void
    {
        Cache::tag('provider:' . $event->providerId)->clear();
        Cache::tag('lightsail')->clear();
        Cache::tag('lightsail:' . $event->providerId)->clear();
        Cache::tag('aws:regions:' . $event->providerId)->clear();
        Cache::tag('aws:billing:' . $event->providerId)->clear();
        Cache::tag('aws:quota:' . $event->providerId)->clear();
    }
}
