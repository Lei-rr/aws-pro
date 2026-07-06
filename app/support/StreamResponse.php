<?php

declare(strict_types=1);

namespace app\support;

use Closure;
use think\Response;

class StreamResponse extends Response
{
    protected $contentType = 'text/event-stream';

    public function __construct(private readonly Closure $callback, int $code = 200, array $headers = [])
    {
        $this->code = $code;
        $this->header = $headers;
    }

    protected function output($data): string
    {
        return '';
    }

    protected function sendData(string $data): void
    {
        ($this->callback)();
    }
}
