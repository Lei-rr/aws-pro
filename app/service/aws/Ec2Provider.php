<?php

declare(strict_types=1);

namespace app\service\aws;

use Aws\Ec2\Ec2Client;
use DateTimeInterface;
use Throwable;

class Ec2Provider
{
    public function __construct(private readonly AwsClientFactory $clients)
    {
    }

    public function instances(array $account, string $region): array
    {
        return $this->call('ec2.instances', function () use ($account, $region): array {
            $items = [];
            $client = $this->client($account, $region);
            $staticIps = $this->elasticIpsByInstance($client);
            $params = ['MaxResults' => 1000];
            do {
                $result = $client->describeInstances($params);
                foreach (($result['Reservations'] ?? []) as $reservation) {
                    foreach (($reservation['Instances'] ?? []) as $instance) {
                        if (($instance['State']['Name'] ?? '') === 'terminated') {
                            continue;
                        }
                        $items[] = $this->instanceView($account, $region, $instance, $staticIps);
                    }
                }
                $params['NextToken'] = (string) ($result['NextToken'] ?? '');
            } while ($params['NextToken'] !== '');
            usort($items, static fn (array $a, array $b): int => [($a['zone'] ?? ''), ($a['id'] ?? '')] <=> [($b['zone'] ?? ''), ($b['id'] ?? '')]);

            return $items;
        });
    }

    public function createInstance(array $account, string $region, array $data): void
    {
        $this->call('ec2.create_instance', function () use ($account, $region, $data): void {
            $client = $this->client($account, $region);
            $input = [
                'ImageId' => $this->resolveAmi($client, (string) $data['ami']),
                'InstanceType' => $data['instance_type'],
                'MinCount' => 1,
                'MaxCount' => 1,
                'MetadataOptions' => [
                    'HttpTokens' => 'required',
                    'HttpEndpoint' => 'enabled',
                ],
                'TagSpecifications' => [[
                    'ResourceType' => 'instance',
                    'Tags' => [['Key' => 'Name', 'Value' => $data['name']]],
                ]],
            ];

            if ((string) ($data['root_password'] ?? '') !== '') {
                $input['UserData'] = base64_encode($this->rootPasswordUserData((string) $data['root_password']));
            }
            if (!empty($data['enable_ipv6'])) {
                $subnetId = $this->selectIpv6Subnet($client);
                $this->ensureSubnetIpv6Route($client, $subnetId);
                $input['SubnetId'] = $subnetId;
                $input['Ipv6AddressCount'] = 1;
            } else {
                $subnetId = $this->selectDefaultLaunchSubnet($client);
                if ($subnetId !== '') {
                    $input['SubnetId'] = $subnetId;
                }
            }

            $client->runInstances($input);
        });
    }

    public function startInstance(array $account, string $region, string $id): void
    {
        $this->call('ec2.start_instance', fn (): mixed => $this->client($account, $region)->startInstances(['InstanceIds' => [$id]]));
    }

    public function stopInstance(array $account, string $region, string $id): void
    {
        $this->call('ec2.stop_instance', fn (): mixed => $this->client($account, $region)->stopInstances(['InstanceIds' => [$id]]));
    }

    public function rebootInstance(array $account, string $region, string $id): void
    {
        $this->call('ec2.reboot_instance', fn (): mixed => $this->client($account, $region)->rebootInstances(['InstanceIds' => [$id]]));
    }

    public function terminateInstance(array $account, string $region, string $id): void
    {
        $this->call('ec2.terminate_instance', function () use ($account, $region, $id): void {
            $client = $this->client($account, $region);
            $this->releaseStaticIpByClient($client, $id);
            $client->terminateInstances(['InstanceIds' => [$id]]);
        });
    }

    public function openAllPorts(array $account, string $region, string $id): void
    {
        $this->call('ec2.open_all_ports', function () use ($account, $region, $id): void {
            $client = $this->client($account, $region);
            $result = $client->describeInstances(['InstanceIds' => [$id]]);
            $groupIds = [];
            foreach (($result['Reservations'] ?? []) as $reservation) {
                foreach (($reservation['Instances'] ?? []) as $instance) {
                    foreach (($instance['SecurityGroups'] ?? []) as $group) {
                        $groupId = (string) ($group['GroupId'] ?? '');
                        if ($groupId !== '') {
                            $groupIds[$groupId] = true;
                        }
                    }
                }
            }
            if ($groupIds === []) {
                throw new \RuntimeException('No security group found for EC2 instance: ' . $id);
            }
            foreach (array_keys($groupIds) as $groupId) {
                $this->authorizeSecurityGroup($client, 'authorizeSecurityGroupIngress', $groupId, [['IpProtocol' => '-1', 'IpRanges' => [['CidrIp' => '0.0.0.0/0']]]]);
                $this->authorizeSecurityGroup($client, 'authorizeSecurityGroupIngress', $groupId, [['IpProtocol' => '-1', 'Ipv6Ranges' => [['CidrIpv6' => '::/0']]]]);
                $this->authorizeSecurityGroup($client, 'authorizeSecurityGroupEgress', $groupId, [['IpProtocol' => '-1', 'IpRanges' => [['CidrIp' => '0.0.0.0/0']]]]);
                $this->authorizeSecurityGroup($client, 'authorizeSecurityGroupEgress', $groupId, [['IpProtocol' => '-1', 'Ipv6Ranges' => [['CidrIpv6' => '::/0']]]]);
            }
        });
    }

    public function allocateStaticIp(array $account, string $region, string $id): void
    {
        $this->call('ec2.allocate_static_ip', function () use ($account, $region, $id): void {
            $client = $this->client($account, $region);
            if ($this->elasticIpForInstance($client, $id) !== null) {
                return;
            }
            $allocation = $client->allocateAddress(['Domain' => 'vpc']);
            $allocationId = (string) ($allocation['AllocationId'] ?? '');
            if ($allocationId === '') {
                throw new \RuntimeException('EC2 AllocateAddress returned empty allocation id');
            }
            try {
                $client->associateAddress(['InstanceId' => $id, 'AllocationId' => $allocationId]);
            } catch (Throwable $exception) {
                $client->releaseAddress(['AllocationId' => $allocationId]);
                throw $exception;
            }
        });
    }

    public function releaseStaticIp(array $account, string $region, string $id): void
    {
        $this->call('ec2.release_static_ip', function () use ($account, $region, $id): void {
            $client = $this->client($account, $region);
            $this->releaseStaticIpByClient($client, $id);
        });
    }

    private function client(array $account, string $region): Ec2Client
    {
        return $this->clients->ec2($account, $region);
    }

    private function resolveAmi(Ec2Client $client, string $key): string
    {
        if (str_starts_with($key, 'ami-')) {
            return $key;
        }
        $options = [
            'ubuntu-24.04' => ['owner' => '099720109477', 'name' => 'ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-*'],
            'ubuntu-22.04' => ['owner' => '099720109477', 'name' => 'ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-*'],
            'debian-12' => ['owner' => '136693071363', 'name' => 'debian-12-*'],
            'amzn-2023' => ['owner' => '137112412989', 'name' => 'al2023-ami-2023.*'],
        ];
        $option = $options[$key] ?? null;
        if (!$option) {
            throw new \RuntimeException('Unknown EC2 AMI option: ' . $key);
        }
        $result = $client->describeImages([
            'Owners' => [$option['owner']],
            'Filters' => [
                ['Name' => 'name', 'Values' => [$option['name']]],
                ['Name' => 'architecture', 'Values' => ['x86_64']],
                ['Name' => 'virtualization-type', 'Values' => ['hvm']],
            ],
        ]);
        $images = $result['Images'] ?? [];
        usort($images, static fn (array $a, array $b): int => strcmp((string) ($b['CreationDate'] ?? ''), (string) ($a['CreationDate'] ?? '')));
        $ami = (string) ($images[0]['ImageId'] ?? '');
        if ($ami === '') {
            throw new \RuntimeException('No EC2 AMI found for: ' . $key);
        }

        return $ami;
    }

    private function selectDefaultLaunchSubnet(Ec2Client $client): string
    {
        $vpcId = $this->defaultVpcId($client);
        $subnets = $this->subnets($client, $vpcId);
        if ($subnets === []) {
            throw new \RuntimeException('Default VPC has no subnet');
        }
        usort($subnets, [$this, 'compareSubnet']);

        return (string) ($subnets[0]['SubnetId'] ?? '');
    }

    private function selectIpv6Subnet(Ec2Client $client): string
    {
        $vpcId = $this->defaultVpcId($client);
        $subnets = $this->subnets($client, $vpcId);
        if ($subnets === []) {
            throw new \RuntimeException('Default VPC has no subnet');
        }
        $candidates = array_values(array_filter($subnets, fn (array $subnet): bool => $this->subnetHasIpv6($subnet)));
        if ($candidates !== []) {
            usort($candidates, [$this, 'compareSubnet']);

            return (string) ($candidates[0]['SubnetId'] ?? '');
        }

        return $this->ensureDefaultIpv6Subnet($client, $vpcId, $subnets);
    }

    private function ensureDefaultIpv6Subnet(Ec2Client $client, string $vpcId, array $subnets): string
    {
        $vpcIpv6 = $this->ensureVpcIpv6($client, $vpcId);
        usort($subnets, [$this, 'compareSubnet']);
        $target = $subnets[0] ?? [];
        foreach ($subnets as $subnet) {
            if ($this->subnetHasIpv6($subnet)) {
                return (string) ($subnet['SubnetId'] ?? '');
            }
            if (!$this->subnetHasIpv6Association($target) && $this->subnetHasIpv6Association($subnet)) {
                $target = $subnet;
            }
        }
        $subnetId = (string) ($target['SubnetId'] ?? '');
        if ($subnetId === '') {
            throw new \RuntimeException('Default VPC has no usable subnet');
        }
        if (!$this->subnetHasIpv6Association($target)) {
            $client->associateSubnetCidrBlock(['SubnetId' => $subnetId, 'Ipv6CidrBlock' => $this->nextSubnetIpv6Cidr($vpcIpv6, $subnets)]);
        }
        for ($i = 0; $i < 10; $i++) {
            sleep(2);
            $result = $client->describeSubnets(['SubnetIds' => [$subnetId]]);
            $subnet = $result['Subnets'][0] ?? [];
            if ($this->subnetHasIpv6($subnet)) {
                return $subnetId;
            }
        }

        throw new \RuntimeException('Subnet IPv6 CIDR is not ready');
    }

    private function ensureVpcIpv6(Ec2Client $client, string $vpcId): string
    {
        $vpc = $this->vpc($client, $vpcId);
        $cidr = $this->associatedVpcIpv6($vpc);
        if ($cidr !== '') {
            return $cidr;
        }
        if (!$this->hasVpcIpv6Association($vpc)) {
            $client->associateVpcCidrBlock(['VpcId' => $vpcId, 'AmazonProvidedIpv6CidrBlock' => true]);
        }
        for ($i = 0; $i < 10; $i++) {
            sleep(2);
            $cidr = $this->associatedVpcIpv6($this->vpc($client, $vpcId));
            if ($cidr !== '') {
                return $cidr;
            }
        }

        throw new \RuntimeException('VPC IPv6 CIDR is not ready');
    }

    private function ensureSubnetIpv6Route(Ec2Client $client, string $subnetId): void
    {
        $subnet = ($client->describeSubnets(['SubnetIds' => [$subnetId]])['Subnets'][0] ?? []);
        $vpcId = (string) ($subnet['VpcId'] ?? '');
        $igw = $client->describeInternetGateways(['Filters' => [['Name' => 'attachment.vpc-id', 'Values' => [$vpcId]]]])['InternetGateways'][0]['InternetGatewayId'] ?? '';
        if ($igw === '') {
            throw new \RuntimeException('VPC has no internet gateway');
        }
        $routeTables = $client->describeRouteTables(['Filters' => [['Name' => 'association.subnet-id', 'Values' => [$subnetId]]]])['RouteTables'] ?? [];
        if ($routeTables === []) {
            $routeTables = $client->describeRouteTables(['Filters' => [['Name' => 'vpc-id', 'Values' => [$vpcId]], ['Name' => 'association.main', 'Values' => ['true']]]])['RouteTables'] ?? [];
        }
        if ($routeTables === []) {
            throw new \RuntimeException('VPC has no available route table: ' . $vpcId);
        }
        $routeTable = $routeTables[0] ?? [];
        $routeTableId = (string) ($routeTable['RouteTableId'] ?? '');
        if ($routeTableId === '') {
            throw new \RuntimeException('Route table id is empty for VPC: ' . $vpcId);
        }
        foreach (($routeTable['Routes'] ?? []) as $route) {
            if (($route['DestinationIpv6CidrBlock'] ?? '') === '::/0' && ($route['GatewayId'] ?? '') === $igw) {
                return;
            }
        }
        try {
            $client->createRoute(['RouteTableId' => $routeTableId, 'DestinationIpv6CidrBlock' => '::/0', 'GatewayId' => $igw]);
        } catch (Throwable $exception) {
            if (!$this->isDuplicateAwsError($exception, ['RouteAlreadyExists', 'InvalidRoute.Duplicate'])) {
                throw $exception;
            }
        }
    }

    private function defaultVpcId(Ec2Client $client): string
    {
        $vpcs = $client->describeVpcs(['Filters' => [['Name' => 'is-default', 'Values' => ['true']]]])['Vpcs'] ?? [];
        $vpcId = (string) ($vpcs[0]['VpcId'] ?? '');
        if ($vpcId === '') {
            throw new \RuntimeException('No default VPC found');
        }

        return $vpcId;
    }

    private function vpc(Ec2Client $client, string $vpcId): array
    {
        return $client->describeVpcs(['VpcIds' => [$vpcId]])['Vpcs'][0] ?? [];
    }

    private function subnets(Ec2Client $client, string $vpcId): array
    {
        return $client->describeSubnets(['Filters' => [['Name' => 'vpc-id', 'Values' => [$vpcId]]]])['Subnets'] ?? [];
    }

    private function subnetHasIpv6(array $subnet): bool
    {
        foreach (($subnet['Ipv6CidrBlockAssociationSet'] ?? []) as $association) {
            if (($association['Ipv6CidrBlockState']['State'] ?? '') === 'associated') {
                return true;
            }
        }

        return false;
    }

    private function subnetHasIpv6Association(array $subnet): bool
    {
        foreach (($subnet['Ipv6CidrBlockAssociationSet'] ?? []) as $association) {
            if (in_array((string) ($association['Ipv6CidrBlockState']['State'] ?? ''), ['associating', 'associated'], true)) {
                return true;
            }
        }

        return false;
    }

    private function associatedVpcIpv6(array $vpc): string
    {
        foreach (($vpc['Ipv6CidrBlockAssociationSet'] ?? []) as $association) {
            if (($association['Ipv6CidrBlockState']['State'] ?? '') === 'associated') {
                return (string) ($association['Ipv6CidrBlock'] ?? '');
            }
        }

        return '';
    }

    private function hasVpcIpv6Association(array $vpc): bool
    {
        foreach (($vpc['Ipv6CidrBlockAssociationSet'] ?? []) as $association) {
            if (in_array((string) ($association['Ipv6CidrBlockState']['State'] ?? ''), ['associating', 'associated'], true)) {
                return true;
            }
        }

        return false;
    }

    private function nextSubnetIpv6Cidr(string $vpcIpv6, array $subnets): string
    {
        [$base, $prefix] = explode('/', $vpcIpv6, 2) + ['', ''];
        $prefixLength = (int) $prefix;
        if ($base === '' || $prefix === '' || $prefixLength < 0 || $prefixLength >= 64) {
            throw new \RuntimeException('VPC IPv6 CIDR must be shorter than /64 for automatic subnet allocation');
        }
        $baseBin = inet_pton($base);
        if ($baseBin === false || strlen($baseBin) !== 16) {
            throw new \RuntimeException('Invalid VPC IPv6 CIDR');
        }
        $subnetBits = 64 - $prefixLength;
        if ($subnetBits > 20) {
            throw new \RuntimeException('VPC IPv6 CIDR is too large for automatic /64 subnet allocation');
        }
        $maxSubnets = 1 << $subnetBits;
        $used = [];
        foreach ($subnets as $subnet) {
            foreach (($subnet['Ipv6CidrBlockAssociationSet'] ?? []) as $association) {
                if (($association['Ipv6CidrBlockState']['State'] ?? '') !== 'associated') {
                    continue;
                }
                $cidr = (string) ($association['Ipv6CidrBlock'] ?? '');
                if (preg_match('/^(.+)\/64$/', $cidr, $match) !== 1) {
                    continue;
                }
                $bin = inet_pton($match[1]);
                if ($bin !== false && strlen($bin) === 16 && $this->sameIpv6Prefix($baseBin, $bin, $prefixLength)) {
                    $used[$this->ipv6SubnetIndex($bin, $prefixLength)] = true;
                }
            }
        }
        for ($i = 0; $i < $maxSubnets; $i++) {
            if (isset($used[$i])) {
                continue;
            }
            $candidateBytes = array_values(unpack('C*', $baseBin));
            for ($bit = $prefixLength; $bit < 128; $bit++) {
                $this->setIpv6Bit($candidateBytes, $bit, 0);
            }
            for ($offset = 0; $offset < $subnetBits; $offset++) {
                $this->setIpv6Bit($candidateBytes, $prefixLength + $offset, ($i >> ($subnetBits - $offset - 1)) & 1);
            }
            $candidate = inet_ntop(pack('C*', ...$candidateBytes));
            if ($candidate !== false) {
                return $candidate . '/64';
            }
        }

        throw new \RuntimeException('No available IPv6 /64 subnet CIDR');
    }

    private function sameIpv6Prefix(string $a, string $b, int $prefixLength): bool
    {
        for ($bit = 0; $bit < $prefixLength; $bit++) {
            if ($this->ipv6Bit($a, $bit) !== $this->ipv6Bit($b, $bit)) {
                return false;
            }
        }

        return true;
    }

    private function ipv6SubnetIndex(string $bin, int $prefixLength): int
    {
        $index = 0;
        for ($bit = $prefixLength; $bit < 64; $bit++) {
            $index = ($index << 1) | $this->ipv6Bit($bin, $bit);
        }

        return $index;
    }

    private function ipv6Bit(string $bin, int $bit): int
    {
        return (ord($bin[intdiv($bit, 8)]) >> (7 - ($bit % 8))) & 1;
    }

    private function setIpv6Bit(array &$bytes, int $bit, int $value): void
    {
        $index = intdiv($bit, 8);
        $mask = 1 << (7 - ($bit % 8));
        $bytes[$index] = $value === 1 ? (($bytes[$index] ?? 0) | $mask) : (($bytes[$index] ?? 0) & ~$mask);
    }

    private function compareSubnet(array $a, array $b): int
    {
        return [empty($a['DefaultForAz']) ? 1 : 0, (string) ($a['AvailabilityZone'] ?? ''), (string) ($a['SubnetId'] ?? '')]
            <=> [empty($b['DefaultForAz']) ? 1 : 0, (string) ($b['AvailabilityZone'] ?? ''), (string) ($b['SubnetId'] ?? '')];
    }

    private function authorizeSecurityGroup(Ec2Client $client, string $method, string $groupId, array $permissions): void
    {
        try {
            $client->{$method}(['GroupId' => $groupId, 'IpPermissions' => $permissions]);
        } catch (Throwable $exception) {
            if (!$this->isDuplicateAwsError($exception, ['InvalidPermission.Duplicate'])) {
                throw $exception;
            }
        }
    }

    private function isDuplicateAwsError(Throwable $exception, array $codes): bool
    {
        return method_exists($exception, 'getAwsErrorCode') && in_array((string) $exception->getAwsErrorCode(), $codes, true);
    }

    private function elasticIpsByInstance(Ec2Client $client): array
    {
        $items = [];
        foreach (($client->describeAddresses([])['Addresses'] ?? []) as $address) {
            $instanceId = (string) ($address['InstanceId'] ?? '');
            $publicIp = (string) ($address['PublicIp'] ?? '');
            if ($instanceId !== '' && $publicIp !== '') {
                $items[$instanceId] = $publicIp;
            }
        }

        return $items;
    }

    private function elasticIpForInstance(Ec2Client $client, string $id): ?array
    {
        foreach (($client->describeAddresses(['Filters' => [['Name' => 'instance-id', 'Values' => [$id]]]])['Addresses'] ?? []) as $address) {
            if ((string) ($address['AllocationId'] ?? '') !== '') {
                return $address;
            }
        }

        return null;
    }

    private function releaseStaticIpByClient(Ec2Client $client, string $id): void
    {
        $address = $this->elasticIpForInstance($client, $id);
        if ($address === null) {
            return;
        }
        $associationId = (string) ($address['AssociationId'] ?? '');
        if ($associationId !== '') {
            $client->disassociateAddress(['AssociationId' => $associationId]);
            $this->waitAddressDisassociated($client, (string) ($address['AllocationId'] ?? ''), $id);
        }
        $allocationId = (string) ($address['AllocationId'] ?? '');
        if ($allocationId !== '') {
            $client->releaseAddress(['AllocationId' => $allocationId]);
        }
    }

    private function waitAddressDisassociated(Ec2Client $client, string $allocationId, string $id): void
    {
        if ($allocationId === '') {
            return;
        }
        for ($attempt = 0; $attempt < 10; $attempt++) {
            $addresses = $client->describeAddresses(['AllocationIds' => [$allocationId]])['Addresses'] ?? [];
            $instanceId = (string) ($addresses[0]['InstanceId'] ?? '');
            $associationId = (string) ($addresses[0]['AssociationId'] ?? '');
            if ($instanceId !== $id && $associationId === '') {
                return;
            }
            usleep(500000);
        }

        throw new \RuntimeException('EC2 Elastic IP did not detach from instance: ' . $id);
    }

    private function instanceView(array $account, string $region, array $instance, array $staticIps): array
    {
        $name = '';
        foreach (($instance['Tags'] ?? []) as $tag) {
            if (($tag['Key'] ?? '') === 'Name') {
                $name = (string) ($tag['Value'] ?? '');
                break;
            }
        }
        $ipv6 = '';
        foreach (($instance['NetworkInterfaces'] ?? []) as $networkInterface) {
            foreach (($networkInterface['Ipv6Addresses'] ?? []) as $address) {
                $ipv6 = (string) ($address['Ipv6Address'] ?? '');
                if ($ipv6 !== '') {
                    break 2;
                }
            }
        }
        $launchedAt = $instance['LaunchTime'] ?? null;

        return [
            'account_id' => (string) ($account['id'] ?? ''),
            'region' => $region,
            'id' => (string) ($instance['InstanceId'] ?? ''),
            'name' => $name,
            'state' => (string) ($instance['State']['Name'] ?? ''),
            'instance_type' => (string) ($instance['InstanceType'] ?? ''),
            'public_ipv4' => (string) ($instance['PublicIpAddress'] ?? ''),
            'static_ip' => $staticIps[(string) ($instance['InstanceId'] ?? '')] ?? '',
            'public_ipv6' => $ipv6,
            'private_ipv4' => (string) ($instance['PrivateIpAddress'] ?? ''),
            'zone' => (string) ($instance['Placement']['AvailabilityZone'] ?? ''),
            'launched_at' => $launchedAt instanceof DateTimeInterface ? $launchedAt->format('Y-m-d H:i:s') : '',
        ];
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
