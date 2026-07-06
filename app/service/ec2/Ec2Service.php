<?php

declare(strict_types=1);

namespace app\service\ec2;

use app\exception\ApiException;
use app\repository\Ec2InstanceRepository;
use app\service\aws\Ec2Provider;
use app\service\concerns\AwsServiceConcern;
use app\support\AwsValidator;

class Ec2Service
{
    use AwsServiceConcern;

    private const AMIS = [
        'ubuntu-24.04' => 'Ubuntu 24.04 LTS',
        'ubuntu-22.04' => 'Ubuntu 22.04 LTS',
        'debian-12' => 'Debian 12',
        'amzn-2023' => 'Amazon Linux 2023',
    ];

    private const INSTANCE_TYPES = [
        't3.micro' => 't3.micro (2C / 1G)',
        't3.small' => 't3.small (2C / 2G)',
        't3.medium' => 't3.medium (2C / 4G)',
        't3.large' => 't3.large (2C / 8G)',
        't3a.micro' => 't3a.micro (2C / 1G)',
        't3a.small' => 't3a.small (2C / 2G)',
        't3a.medium' => 't3a.medium (2C / 4G)',
        'm6i.large' => 'm6i.large (2C / 8G)',
        'c6i.large' => 'c6i.large (2C / 4G)',
        'r6i.large' => 'r6i.large (2C / 16G)',
    ];

    public function __construct(
        private readonly Ec2Provider $provider,
        private readonly Ec2InstanceRepository $instances,
    ) {
    }

    public function options(): array
    {
        return [
            'amis' => self::AMIS,
            'instance_types' => self::INSTANCE_TYPES,
        ];
    }

    public function listCached(mixed $accountId = null, mixed $region = null): array
    {
        $filters = $this->normalizeListFilters(['account_id' => $accountId, 'region' => $region]);
        $cacheKey = $this->buildCacheKey('ec2.list', [
            'account_id' => (string) ($filters['account_id'] ?? ''),
            'region' => (string) ($filters['region'] ?? ''),
        ]);
        $cached = $this->getCached($cacheKey, false);
        if ($cached !== null) {
            return ['items' => $cached, 'meta' => $this->responseMeta(true, 'cache')];
        }

        $items = $this->loadAndSortInstances($filters['account_id'], $filters['region']);
        $this->setCached($cacheKey, $items, $this->ec2CacheTags($filters['account_id']));

        return ['items' => $items, 'meta' => $this->responseMeta(false, 'local')];
    }

    public function sync(array $account, string $accountId, string $region): array
    {
        $remarks = $this->remarksByInstance($this->instances->all());
        $synced = array_map(function (array $item) use ($remarks): array {
            $key = $this->instanceKey((string) ($item['account_id'] ?? ''), (string) ($item['region'] ?? ''), (string) ($item['id'] ?? ''));
            if (isset($remarks[$key])) {
                $item['remark'] = $remarks[$key];
            }

            return $item;
        }, $this->provider->instances($account, $region));
        $this->instances->replaceScope($accountId, $region, $synced);
        $this->invalidateEc2Cache($accountId);

        return [
            'instances' => $synced,
            'count' => count($synced),
            'account_id' => $accountId,
            'region' => $region,
        ];
    }

    public function createInstance(array $account, string $region, array $data): void
    {
        $this->provider->createInstance($account, $region, $this->normalizeCreateData($data));
        $this->invalidateEc2Cache((string) $account['id']);
    }

    public function runAction(array $account, string $region, string $instanceId, array $input): string
    {
        $action = $this->normalizeActionData($input)['action'];
        $instanceId = $this->instanceId($instanceId);

        match ($action) {
            'allocate_static_ip' => $this->provider->allocateStaticIp($account, $region, $instanceId),
            'release_static_ip' => $this->provider->releaseStaticIp($account, $region, $instanceId),
            'start' => $this->provider->startInstance($account, $region, $instanceId),
            'stop' => $this->provider->stopInstance($account, $region, $instanceId),
            'reboot' => $this->provider->rebootInstance($account, $region, $instanceId),
            'terminate' => $this->terminateInstance($account, $region, $instanceId),
            'open_ports' => $this->provider->openAllPorts($account, $region, $instanceId),
            default => throw new ApiException('Invalid EC2 action', 422, 'ec2_action_invalid', ['action' => $action]),
        };

        $this->invalidateEc2Cache((string) $account['id']);

        return $action . ' submitted';
    }

    public function updateRemark(string $accountId, string $region, string $instanceId, string $remark): array
    {
        $instanceId = $this->instanceId($instanceId);
        $remark = trim($remark);
        $instance = $this->instances->updateRemark($accountId, $region, $instanceId, $remark);
        if ($instance === null) {
            throw new ApiException('EC2 instance not found', 404, 'ec2_instance_not_found', ['instance' => $instanceId]);
        }
        $this->invalidateEc2Cache($accountId);

        return $instance;
    }

    private function normalizeListFilters(array $filters): array
    {
        $accountId = trim((string) ($filters['account_id'] ?? ''));
        $region = trim((string) ($filters['region'] ?? ''));

        return [
            'account_id' => $accountId !== '' ? AwsValidator::accountId($accountId) : null,
            'region' => $region !== '' ? AwsValidator::region($region) : null,
        ];
    }

    private function normalizeCreateData(array $data): array
    {
        AwsValidator::required($data, ['name', 'ami', 'instance_type']);
        $ami = trim((string) $data['ami']);
        if (!isset(self::AMIS[$ami]) && !str_starts_with($ami, 'ami-')) {
            throw new ApiException('Invalid EC2 AMI', 422, 'ec2_ami_invalid', ['ami' => $ami]);
        }
        $instanceType = trim((string) $data['instance_type']);
        if (!isset(self::INSTANCE_TYPES[$instanceType])) {
            throw new ApiException('Invalid EC2 instance type', 422, 'ec2_instance_type_invalid', ['instance_type' => $instanceType]);
        }
        return [
            'name' => AwsValidator::instanceName((string) $data['name']),
            'ami' => $ami,
            'instance_type' => $instanceType,
            'enable_ipv6' => filter_var($data['enable_ipv6'] ?? false, FILTER_VALIDATE_BOOL),
            'root_password' => (string) ($data['root_password'] ?? ''),
        ];
    }

    private function normalizeActionData(array $data): array
    {
        $action = trim((string) ($data['action'] ?? ''));
        $allowed = ['allocate_static_ip', 'release_static_ip', 'start', 'stop', 'reboot', 'terminate', 'open_ports'];
        if (!in_array($action, $allowed, true)) {
            throw new ApiException('Invalid EC2 action', 422, 'ec2_action_invalid', ['action' => $action]);
        }
        if ((string) ($data['confirm'] ?? '') !== $action) {
            throw new ApiException('Action confirmation is required', 422, 'ec2_action_confirm_required', ['action' => $action]);
        }

        return ['action' => $action];
    }

    private function instanceId(string $value): string
    {
        $value = trim($value);
        if (preg_match('/^i-[a-f0-9]+$/', $value) !== 1) {
            throw new ApiException('Invalid EC2 instance id', 422, 'ec2_instance_id_invalid', ['id' => $value]);
        }

        return $value;
    }

    private function loadAndSortInstances(?string $accountId, ?string $region): array
    {
        $items = array_filter($this->instances->all(), static function (array $item) use ($accountId, $region): bool {
            return ($accountId === null || (string) ($item['account_id'] ?? '') === $accountId)
                && ($region === null || (string) ($item['region'] ?? '') === $region);
        });
        usort($items, static fn (array $a, array $b): int => [($a['account_id'] ?? ''), ($a['region'] ?? ''), ($a['id'] ?? '')] <=> [($b['account_id'] ?? ''), ($b['region'] ?? ''), ($b['id'] ?? '')]);

        return array_values($items);
    }

    private function terminateInstance(array $account, string $region, string $instanceId): void
    {
        $this->provider->terminateInstance($account, $region, $instanceId);
        $this->instances->deleteInstance((string) $account['id'], $region, $instanceId);
    }

    private function instanceKey(string $accountId, string $region, string $id): string
    {
        return $accountId . "\n" . $region . "\n" . $id;
    }

    private function remarksByInstance(array $items): array
    {
        $remarks = [];
        foreach ($items as $item) {
            $key = $this->instanceKey((string) ($item['account_id'] ?? ''), (string) ($item['region'] ?? ''), (string) ($item['id'] ?? ''));
            $remark = (string) ($item['remark'] ?? '');
            if ($remark !== '') {
                $remarks[$key] = $remark;
            }
        }

        return $remarks;
    }

    private function ec2CacheTags(?string $accountId): array
    {
        $tags = [$this->ec2CacheTag()];
        if ($accountId !== null && $accountId !== '') {
            $tags[] = $this->providerCacheTag($accountId);
            $tags[] = $this->ec2AccountCacheTag($accountId);
        }

        return $tags;
    }

    private function invalidateEc2Cache(string $accountId): void
    {
        $this->invalidateCache($this->providerCacheTag($accountId), $this->ec2CacheTag(), $this->ec2AccountCacheTag($accountId));
    }

    private function ec2CacheTag(): string
    {
        return $this->buildCacheTag('ec2');
    }

    private function ec2AccountCacheTag(string $accountId): string
    {
        return $this->buildCacheTag('ec2', $accountId);
    }
}
