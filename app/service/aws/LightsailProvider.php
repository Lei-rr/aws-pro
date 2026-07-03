<?php

declare(strict_types=1);

namespace app\service\aws;

use Aws\Lightsail\LightsailClient;
use Exception;
use Throwable;

class LightsailProvider
{
    public function __construct(private readonly AwsClientFactory $clients)
    {
    }

    public function availabilityZones(array $account, string $region): array
    {
        return $this->call('lightsail.availability_zones', function () use ($account, $region): array {
            $items = [];
            foreach (($this->client($account, $region)->getRegions(['includeAvailabilityZones' => true])['regions'] ?? []) as $item) {
                if (($item['name'] ?? '') !== $region) {
                    continue;
                }
                foreach ($item['availabilityZones'] ?? [] as $zone) {
                    if (($zone['state'] ?? '') === 'available') {
                        $items[] = $zone['zoneName'];
                    }
                }
            }

            return $items;
        });
    }

    public function createInstance(array $account, string $region, array $data): void
    {
        $this->call('lightsail.create_instance', function () use ($account, $region, $data): void {
            $input = [
                'instanceNames' => [$data['name']],
                'availabilityZone' => $data['zone'],
                'blueprintId' => $data['blueprint'],
                'bundleId' => $data['bundle'],
            ];
            if (!empty($data['root_password'])) {
                $input['userData'] = $this->rootPasswordUserData((string) $data['root_password']);
            }

            $this->client($account, $region)->createInstances($input);
        });
    }

    public function instances(array $account, string $region): array
    {
        return $this->call('lightsail.instances', function () use ($account, $region): array {
            $items = [];
            $client = $this->client($account, $region);
            $staticIps = [];
            try {
                foreach (($client->getStaticIps([])['staticIps'] ?? []) as $ip) {
                    if (!empty($ip['attachedTo']) && !empty($ip['ipAddress']) && (($ip['isAttached'] ?? true) === true)) {
                        $staticIps[$ip['attachedTo']] = $ip['ipAddress'];
                    }
                }
            } catch (Exception) {
                $staticIps = [];
            }

            foreach (($client->getInstances([])['instances'] ?? []) as $item) {
                $name = $item['name'] ?? '';
                $bundleId = (string) ($item['bundleId'] ?? '');
                $items[] = [
                    'account_id' => $account['id'],
                    'region' => $region,
                    'name' => $name,
                    'state' => $item['state']['name'] ?? '',
                    'public_ip' => $item['publicIpAddress'] ?? '',
                    'static_ip' => $staticIps[$name] ?? '',
                    'ipv6' => $item['ipv6Addresses'][0] ?? '',
                    'zone' => $item['location']['availabilityZone'] ?? '',
                    'bundle_id' => $bundleId,
                ];
            }

            return $items;
        });
    }

    public function allocateStaticIp(array $account, string $region, string $instanceName): void
    {
        $this->call('lightsail.allocate_static_ip', function () use ($account, $region, $instanceName): void {
            $client = $this->client($account, $region);
            $staticIpName = 'sip-' . preg_replace('/[^A-Za-z0-9-]/', '-', $instanceName) . '-' . time();
            $client->allocateStaticIp(['staticIpName' => $staticIpName]);
            $client->attachStaticIp(['staticIpName' => $staticIpName, 'instanceName' => $instanceName]);
        });
    }

    public function releaseStaticIp(array $account, string $region, string $instanceName): void
    {
        $this->call('lightsail.release_static_ip', function () use ($account, $region, $instanceName): void {
            $client = $this->client($account, $region);
            $staticIpName = $this->attachedStaticIpName($client, $instanceName);
            if ($staticIpName === '') {
                return;
            }
            $client->detachStaticIp(['staticIpName' => $staticIpName]);
            $this->waitStaticIpDetached($client, $staticIpName);
            $client->releaseStaticIp(['staticIpName' => $staticIpName]);
        });
    }

    public function startInstance(array $account, string $region, string $instanceName): void
    {
        $this->call('lightsail.start_instance', fn (): mixed => $this->client($account, $region)->startInstance(['instanceName' => $instanceName]));
    }

    public function stopInstance(array $account, string $region, string $instanceName): void
    {
        $this->call('lightsail.stop_instance', fn (): mixed => $this->client($account, $region)->stopInstance(['instanceName' => $instanceName]));
    }

    public function rebootInstance(array $account, string $region, string $instanceName): void
    {
        $this->call('lightsail.reboot_instance', fn (): mixed => $this->client($account, $region)->rebootInstance(['instanceName' => $instanceName]));
    }

    public function deleteInstance(array $account, string $region, string $instanceName): void
    {
        $this->call('lightsail.delete_instance', function () use ($account, $region, $instanceName): void {
            $this->releaseStaticIp($account, $region, $instanceName);
            $this->client($account, $region)->deleteInstance(['instanceName' => $instanceName]);
        });
    }

    public function openAllPorts(array $account, string $region, string $instanceName): void
    {
        $this->call('lightsail.open_all_ports', fn (): mixed => $this->client($account, $region)->openInstancePublicPorts(['instanceName' => $instanceName, 'portInfo' => ['fromPort' => 0, 'toPort' => 65535, 'protocol' => 'all']]));
    }

    private function client(array $account, string $region): LightsailClient
    {
        return $this->clients->lightsail($account, $region);
    }

    private function attachedStaticIpName(mixed $client, string $instanceName): string
    {
        foreach (($client->getStaticIps([])['staticIps'] ?? []) as $ip) {
            if (($ip['attachedTo'] ?? '') === $instanceName && (($ip['isAttached'] ?? true) === true)) {
                return (string) ($ip['name'] ?? '');
            }
        }

        return '';
    }

    private function waitStaticIpDetached(mixed $client, string $staticIpName): void
    {
        for ($i = 0; $i < 10; $i++) {
            try {
                $ip = $client->getStaticIp(['staticIpName' => $staticIpName])['staticIp'] ?? [];
                if (empty($ip['isAttached']) || empty($ip['attachedTo'])) {
                    return;
                }
            } catch (Exception) {
                return;
            }
            sleep(2);
        }
    }

    private function rootPasswordUserData(string $password): string
    {
        $password = base64_encode($password);

        return "#!/bin/bash\nset -e\npassword=\$(printf '%s' '{$password}' | base64 -d)\necho \"root:\$password\" | chpasswd\npasswd -u root || true\nsed -i 's@^Include[ ]*/etc/ssh/sshd_config.d/\\*.conf@# Include /etc/ssh/sshd_config.d/*.conf@' /etc/ssh/sshd_config\nsed -i 's/^#\\?PermitRootLogin.*/PermitRootLogin yes/g' /etc/ssh/sshd_config\nsed -i 's/^#\\?PasswordAuthentication.*/PasswordAuthentication yes/g' /etc/ssh/sshd_config\nsed -i 's/^#\\?PubkeyAuthentication.*/PubkeyAuthentication no/g' /etc/ssh/sshd_config\nsed -i '/^AuthorizedKeysFile/s/^/#/' /etc/ssh/sshd_config\nsed -i 's/^#\\?KbdInteractiveAuthentication.*/KbdInteractiveAuthentication yes/g' /etc/ssh/sshd_config\nsed -i 's/^#\\?ChallengeResponseAuthentication.*/ChallengeResponseAuthentication yes/g' /etc/ssh/sshd_config\nif grep -qi alpine /etc/os-release 2>/dev/null; then service sshd restart || true; else systemctl restart ssh || systemctl restart sshd || service ssh restart || service sshd restart || true; fi\n";
    }

    private function call(string $operation, callable $callback): mixed
    {
        try {
            return $callback();
        } catch (Throwable $exception) {
            throw AwsError::convert($exception, $operation);
        }
    }
}
