<?php

declare(strict_types=1);

namespace app\event;

class ProviderUpdatedEvent
{
    public function __construct(
        public readonly string $providerId,
        public readonly string $action,
        public readonly int $userId,
    ) {
    }
}
