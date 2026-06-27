<?php

declare(strict_types=1);

namespace app\service\account;

use app\event\ProviderUpdatedEvent;
use app\exception\ApiException;
use app\repository\AccountRepository;
use app\repository\InstanceRepository;
use app\support\AwsValidator;
use app\support\SecretMasker;

class AccountService
{
    public function __construct(private readonly AccountRepository $accounts, private readonly InstanceRepository $instances)
    {
    }

    public function allPublic(): array
    {
        return array_map([$this, 'publicAccount'], $this->accounts->all());
    }

    public function findPublic(string $id): array
    {
        $account = $this->accounts->find($id);
        if (!$account) {
            throw new ApiException('Account not found', 404, 'account_not_found', ['id' => $id]);
        }

        return $this->publicAccount($account);
    }

    public function create(array $body): array
    {
        AwsValidator::required($body, ['id', 'access_key']);
        $id = AwsValidator::accountId((string) $body['id']);
        if ($this->accounts->find($id)) {
            throw new ApiException('Account already exists', 409, 'account_already_exists', ['id' => $id]);
        }

        $account = $this->save($body, $id, false);
        event(new ProviderUpdatedEvent($id, 'create'));

        return $this->publicAccount($account);
    }

    public function update(string $id, array $body): array
    {
        $account = $this->save($body, $id, true);
        event(new ProviderUpdatedEvent($id, 'update'));

        if ((string) ($account['id'] ?? '') !== $id) {
            event(new ProviderUpdatedEvent((string) $account['id'], 'update'));
        }

        return $this->publicAccount($account);
    }

    public function delete(string $id): void
    {
        if (!$this->accounts->find($id)) {
            throw new ApiException('Account not found', 404, 'account_not_found', ['id' => $id]);
        }

        $this->accounts->saveAll(array_filter($this->accounts->all(), static fn (array $account): bool => (string) ($account['id'] ?? '') !== $id));
        $this->instances->deleteByAccount($id);
        event(new ProviderUpdatedEvent($id, 'delete'));
    }

    public function requireAccount(string $id): array
    {
        $account = $this->accounts->find($id);
        if (!$account) {
            throw new ApiException('Account not found', 404, 'account_not_found', ['id' => $id]);
        }

        return $account;
    }

    /**
     * Standardize and validate account input data.
     *
     * Performs trim, type casting and required-field checks.
     *
     * @param array $data    Raw account input
     * @param string|null $fallbackId  Fallback id when input has none
     *
     * @return array{id: string, access_key: string, secret_key: string, remark: string}
     *
     * @throws ApiException
     */
    public function normalizeAccountData(array $data, ?string $fallbackId = null): array
    {
        $id = AwsValidator::accountId((string) ($data['id'] ?? $fallbackId ?? ''));
        $accessKey = trim((string) ($data['access_key'] ?? ''));
        $secretKey = trim((string) ($data['secret_key'] ?? ''));
        $remark = trim((string) ($data['remark'] ?? ''));

        if ($accessKey === '') {
            throw new ApiException('access_key is required', 422, 'field_required', ['field' => 'access_key']);
        }
        if ($secretKey === '') {
            throw new ApiException('secret_key is required', 422, 'field_required', ['field' => 'secret_key']);
        }

        return ['id' => $id, 'access_key' => $accessKey, 'secret_key' => $secretKey, 'remark' => $remark];
    }

    private function save(array $body, string $id, bool $updating): array
    {
        $newId = AwsValidator::accountId((string) ($body['id'] ?? $id));
        $existing = $this->accounts->find($id);
        if ($updating && !$existing) {
            throw new ApiException('Account not found', 404, 'account_not_found', ['id' => $id]);
        }
        if ($newId !== $id && $this->accounts->find($newId)) {
            throw new ApiException('Account already exists', 409, 'account_already_exists', ['id' => $newId]);
        }

        $mergedData = $body;
        if ($existing && !isset($mergedData['secret_key'])) {
            $mergedData['secret_key'] = (string) ($existing['secret_key'] ?? '');
        }

        $account = $this->normalizeAccountData($mergedData, $id);
        $account['id'] = $newId;

        $accounts = array_values(array_filter($this->accounts->all(), static fn (array $item): bool => (string) ($item['id'] ?? '') !== $id));
        $accounts[] = $account;
        $this->accounts->saveAll($accounts);
        if ($id !== $newId) {
            $this->instances->renameAccount($id, $newId);
        }

        return $account;
    }

    private function publicAccount(array $account): array
    {
        return [
            'id' => $account['id'] ?? '',
            'access_key' => $account['access_key'] ?? '',
            'has_secret_key' => trim((string) ($account['secret_key'] ?? '')) !== '',
            'secret_key_masked' => SecretMasker::mask((string) ($account['secret_key'] ?? '')),
            'remark' => $account['remark'] ?? '',
        ];
    }
}
