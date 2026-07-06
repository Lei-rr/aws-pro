<?php

declare(strict_types=1);

namespace app\service\newbie;

use app\exception\ApiException;
use app\repository\NewbieTaskRepository;
use app\service\account\AccountService;
use app\support\AwsValidator;
use Throwable;

class NewbieTaskService
{
    public function __construct(
        private readonly AccountService $accounts,
        private readonly NewbieTaskRepository $tasks,
        private readonly NewbieTaskRunner $runner,
    ) {
    }

    public function create(array $body): array
    {
        AwsValidator::required($body, ['account_id']);
        $accountId = AwsValidator::accountId((string) $body['account_id']);
        $this->accounts->requireAccount($accountId);
        $step = $this->step((string) ($body['step'] ?? 'all'));
        $task = $this->tasks->create($accountId, $step, $this->runner->stepLabel($step));
        if (!$task) {
            throw new ApiException('Another newbie task is running', 409, 'newbie_task_running');
        }

        return $task;
    }

    public function find(string $id): array
    {
        $task = $this->tasks->find($this->taskId($id));
        if (!$task) {
            throw new ApiException('Newbie task not found', 404, 'newbie_task_not_found', ['task_id' => $id]);
        }

        return $task;
    }

    public function runStream(string $id, callable $emit): void
    {
        $task = $this->find($id);
        if (($task['status'] ?? '') === 'cancelling') {
            $emit('任务已终止：终止请求已接受，任务未开始执行。');
            $this->tasks->delete((string) $task['id']);
            return;
        }

        if (($task['status'] ?? '') !== 'pending') {
            $emit('任务状态：' . ($task['status'] ?? 'unknown'));
            if (($task['message'] ?? '') !== '') {
                $emit((string) $task['message']);
            }

            return;
        }

        $account = $this->accounts->requireAccount((string) $task['account_id']);
        $this->tasks->updateStatus((string) $task['id'], 'running', 'running');
        try {
            $this->runner->run($account, (string) ($task['step'] ?? 'all'), is_array($task['operation_ids'] ?? null) ? $task['operation_ids'] : [], $emit, fn (): bool => $this->tasks->cancelRequested((string) $task['id']));
            $emit('执行完毕，连接断开。');
        } catch (NewbieTaskCancelledException $exception) {
            $emit('任务已终止：' . $exception->getMessage());
        } catch (Throwable $exception) {
            $emit('任务失败：' . $exception->getMessage());
        } finally {
            $this->tasks->delete((string) $task['id']);
        }
    }

    public function cancel(string $id): array
    {
        $id = $this->taskId($id);
        $task = $this->tasks->find($id);
        if (!$task) {
            throw new ApiException('Newbie task not found', 404, 'newbie_task_not_found', ['task_id' => $id]);
        }
        if (!$this->tasks->cancel($id)) {
            throw new ApiException('Newbie task cannot be cancelled', 409, 'newbie_task_cancel_invalid', ['task_id' => $id]);
        }

        return $this->tasks->find($id) ?? $task;
    }

    private function taskId(string $id): string
    {
        $id = trim($id);
        if (preg_match('/^[a-f0-9]{16}$/', $id) !== 1) {
            throw new ApiException('Invalid newbie task id', 422, 'newbie_task_id_invalid');
        }

        return $id;
    }

    private function step(string $step): string
    {
        $step = trim($step) === '' ? 'all' : trim($step);
        if (!$this->runner->hasStep($step)) {
            throw new ApiException('Invalid newbie task step', 422, 'newbie_task_step_invalid', ['step' => $step]);
        }

        return $step;
    }
}
