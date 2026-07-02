<?php

declare(strict_types=1);

namespace app\listener;

use app\event\ProviderUpdatedEvent;
use think\facade\Cache;

class ClearProviderCache
{
    public function handle(ProviderUpdatedEvent $event): void
    {
        $tags = (array) config('services.provider_cache_tags', []);
        foreach ($tags as $tag) {
            if (is_string($tag) && $tag !== '') {
                Cache::tag(str_replace('{providerId}', $event->providerId, $tag))->clear();
            }
        }
    }
}
