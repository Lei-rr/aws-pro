<?php

declare(strict_types=1);

namespace app\controller\newbie;

use app\service\newbie\NewbieTaskService;
use app\support\ApiResponse;
use app\support\StreamResponse;
use think\Response;

class NewbieTaskController
{
    public function __construct(private readonly NewbieTaskService $tasks)
    {
    }

    public function store(): Response
    {
        return ApiResponse::data($this->tasks->create(input('post.', [])), 201);
    }

    public function show(string $task): Response
    {
        return ApiResponse::data($this->tasks->find($task));
    }

    public function stream(string $task): Response
    {
        return new StreamResponse(function () use ($task): void {
            ignore_user_abort(true);
            set_time_limit(0);
            while (ob_get_level() > 0) {
                ob_end_flush();
            }

            $emit = static function (string $format, mixed ...$args): void {
                $message = $args === [] ? $format : sprintf($format, ...$args);
                foreach (explode("\n", $message) as $line) {
                    echo 'data: ' . str_replace(["\r", "\n"], '', $line) . "\n\n";
                }
                flush();
            };

            $this->tasks->runStream($task, $emit);
        }, 200, [
            'Content-Type' => 'text/event-stream; charset=utf-8',
            'Cache-Control' => 'no-cache',
            'X-Accel-Buffering' => 'no',
        ]);
    }
}
