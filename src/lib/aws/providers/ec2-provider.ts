
import {
  AllocateAddressCommand,
  AssociateAddressCommand,
  AssociateSubnetCidrBlockCommand,
  AssociateVpcCidrBlockCommand,
  AuthorizeSecurityGroupEgressCommand,
  AuthorizeSecurityGroupIngressCommand,
  CreateRouteCommand,
  DescribeImagesCommand,
  DescribeInstancesCommand,
  DescribeInternetGatewaysCommand,
  DescribeRouteTablesCommand,
  DescribeSubnetsCommand,
  DescribeVpcsCommand,
  DisassociateAddressCommand,
  EC2Client,
  RebootInstancesCommand,
  ReleaseAddressCommand,
  RunInstancesCommand,
  StartInstancesCommand,
  StopInstancesCommand,
  TerminateInstancesCommand,
} from '@aws-sdk/client-ec2'
import type { AwsAccount, Ec2Instance } from '../../../types/aws.js'
import { AwsClientFactory } from '../client-factory.js'
import { awsCall } from '../errors.js'
import { withAwsRetry } from '../retry.js'

function rootPasswordUserData(password: string) {
  const encoded = Buffer.from(password, 'utf8').toString('base64')
  return `#!/bin/bash
set -e
password=$(printf '%s' '${encoded}' | base64 -d)
echo "root:$password" | chpasswd
passwd -u root || true
sed -i 's/^#\\?PermitRootLogin.*/PermitRootLogin yes/g' /etc/ssh/sshd_config
sed -i 's/^#\\?PasswordAuthentication.*/PasswordAuthentication yes/g' /etc/ssh/sshd_config
systemctl restart ssh || systemctl restart sshd || true
`
}

function tagName(tags: any[] | undefined) {
  return String((tags ?? []).find((t) => t.Key === 'Name')?.Value ?? '')
}

export class Ec2Provider {
  constructor(private readonly clients = new AwsClientFactory()) {}

  async instances(account: AwsAccount, region: string): Promise<Ec2Instance[]> {
    return awsCall('ec2.instances', async () => {
      const client = this.clients.ec2(account, region)
      const staticIps = await this.elasticIpsByInstance(client)
      const items: Ec2Instance[] = []
      let nextToken: string | undefined
      do {
        const result = await client.send(new DescribeInstancesCommand({ MaxResults: 1000, NextToken: nextToken }))
        for (const reservation of result.Reservations ?? []) {
          for (const instance of reservation.Instances ?? []) {
            if (instance.State?.Name === 'terminated') continue
            items.push(this.instanceView(account, region, instance, staticIps))
          }
        }
        nextToken = result.NextToken
      } while (nextToken)
      items.sort((a, b) => `${a.zone}|${a.name}|${a.id}`.localeCompare(`${b.zone}|${b.name}|${b.id}`))
      return items
    })
  }

  async createInstance(account: AwsAccount, region: string, data: Record<string, any>) {
    return awsCall('ec2.create_instance', async () => {
      const client = this.clients.ec2(account, region)
      const input: any = {
        ImageId: await this.resolveAmi(client, String(data.ami)),
        InstanceType: data.instance_type,
        MinCount: 1,
        MaxCount: 1,
        MetadataOptions: { HttpTokens: 'required', HttpEndpoint: 'enabled' },
        TagSpecifications: [{ ResourceType: 'instance', Tags: [{ Key: 'Name', Value: data.name }] }],
      }
      if (data.client_token) input.ClientToken = String(data.client_token)
      if (data.root_password) input.UserData = Buffer.from(rootPasswordUserData(String(data.root_password))).toString('base64')
      if (data.enable_ipv6) {
        const subnetId = await this.selectIpv6Subnet(client)
        await this.ensureSubnetIpv6Route(client, subnetId)
        input.SubnetId = subnetId
        input.Ipv6AddressCount = 1
      } else {
        const subnetId = await this.selectDefaultLaunchSubnet(client)
        if (subnetId) input.SubnetId = subnetId
      }
      await withAwsRetry('run EC2 instance', () => client.send(new RunInstancesCommand(input)))
    })
  }

  async startInstance(account: AwsAccount, region: string, id: string) {
    return awsCall('ec2.start_instance', async () => {
      await withAwsRetry('start EC2 instance', () => this.clients.ec2(account, region).send(new StartInstancesCommand({ InstanceIds: [id] })))
    })
  }
  async stopInstance(account: AwsAccount, region: string, id: string) {
    return awsCall('ec2.stop_instance', async () => {
      await withAwsRetry('stop EC2 instance', () => this.clients.ec2(account, region).send(new StopInstancesCommand({ InstanceIds: [id] })))
    })
  }
  async rebootInstance(account: AwsAccount, region: string, id: string) {
    return awsCall('ec2.reboot_instance', async () => {
      await withAwsRetry('reboot EC2 instance', () => this.clients.ec2(account, region).send(new RebootInstancesCommand({ InstanceIds: [id] })))
    })
  }
  async terminateInstance(account: AwsAccount, region: string, id: string) {
    return awsCall('ec2.terminate_instance', async () => {
      const client = this.clients.ec2(account, region)
      try {
        await this.releaseStaticIpByClient(client, id)
      } catch (error) {
        throw new Error(`Elastic IP cleanup failed; instance was not terminated: ${error instanceof Error ? error.message : String(error)}`)
      }
      await withAwsRetry('terminate EC2 instance', () => client.send(new TerminateInstancesCommand({ InstanceIds: [id] })))
    })
  }

  async openAllPorts(account: AwsAccount, region: string, id: string) {
    return awsCall('ec2.open_all_ports', async () => {
      const client = this.clients.ec2(account, region)
      const result = await client.send(new DescribeInstancesCommand({ InstanceIds: [id] }))
      const groupIds = new Set<string>()
      for (const reservation of result.Reservations ?? []) {
        for (const instance of reservation.Instances ?? []) {
          for (const group of instance.SecurityGroups ?? []) {
            if (group.GroupId) groupIds.add(group.GroupId)
          }
        }
      }
      if (!groupIds.size) throw new Error(`No security group found for EC2 instance: ${id}`)
      for (const groupId of groupIds) {
        await this.authorize(client, 'ingress', groupId, [{ IpProtocol: '-1', IpRanges: [{ CidrIp: '0.0.0.0/0' }] }])
        await this.authorize(client, 'ingress', groupId, [{ IpProtocol: '-1', Ipv6Ranges: [{ CidrIpv6: '::/0' }] }])
        await this.authorize(client, 'egress', groupId, [{ IpProtocol: '-1', IpRanges: [{ CidrIp: '0.0.0.0/0' }] }])
        await this.authorize(client, 'egress', groupId, [{ IpProtocol: '-1', Ipv6Ranges: [{ CidrIpv6: '::/0' }] }])
      }
    })
  }

  async allocateStaticIp(account: AwsAccount, region: string, id: string) {
    return awsCall('ec2.allocate_static_ip', async () => {
      const client = this.clients.ec2(account, region)
      if (await this.elasticIpForInstance(client, id)) return
      const allocation = await withAwsRetry('allocate EC2 Elastic IP', () => client.send(new AllocateAddressCommand({ Domain: 'vpc' })))
      const allocationId = String(allocation?.AllocationId ?? '')
      if (!allocationId) throw new Error('EC2 AllocateAddress returned empty allocation id')
      try {
        await withAwsRetry('associate EC2 Elastic IP', () =>
          client.send(new AssociateAddressCommand({ InstanceId: id, AllocationId: allocationId })),
        )
      } catch (error) {
        await this.safeReleaseAddress(client, allocationId)
        throw error
      }
    })
  }

  async releaseStaticIp(account: AwsAccount, region: string, id: string) {
    return awsCall('ec2.release_static_ip', async () => {
      await this.releaseStaticIpByClient(this.clients.ec2(account, region), id)
    })
  }

  private instanceView(account: AwsAccount, region: string, instance: any, staticIps: Record<string, string>): Ec2Instance {
    const id = String(instance.InstanceId ?? '')
    return {
      account_id: account.id,
      region,
      id,
      name: tagName(instance.Tags) || id,
      state: String(instance.State?.Name ?? ''),
      public_ip: instance.PublicIpAddress ?? '',
      static_ip: staticIps[id] ?? '',
      ipv6: instance.Ipv6Address ?? instance.NetworkInterfaces?.[0]?.Ipv6Addresses?.[0]?.Ipv6Address ?? '',
      zone: instance.Placement?.AvailabilityZone ?? '',
      instance_type: instance.InstanceType ?? '',
    }
  }

  private async elasticIpsByInstance(client: EC2Client) {
    const map: Record<string, string> = {}
    // describeAddresses via runInstances path using SDK command dynamically
    const { DescribeAddressesCommand } = await import('@aws-sdk/client-ec2')
    const result = await client.send(new DescribeAddressesCommand({}))
    for (const addr of result.Addresses ?? []) {
      if (addr.InstanceId && addr.PublicIp) map[addr.InstanceId] = addr.PublicIp
    }
    return map
  }

  private async elasticIpForInstance(client: EC2Client, id: string) {
    const map = await this.elasticIpsByInstance(client)
    return map[id] ? { publicIp: map[id] } : null
  }

  private async releaseStaticIpByClient(client: EC2Client, id: string) {
    const { DescribeAddressesCommand } = await import('@aws-sdk/client-ec2')
    const result = await client.send(new DescribeAddressesCommand({}))
    for (const addr of result.Addresses ?? []) {
      if (addr.InstanceId !== id) continue
      if (addr.AssociationId) {
        await withAwsRetry('disassociate EC2 Elastic IP', () =>
          client.send(new DisassociateAddressCommand({ AssociationId: addr.AssociationId })),
          ['InvalidAssociationID.NotFound'],
        )
      }
      if (addr.AllocationId) await this.safeReleaseAddress(client, addr.AllocationId)
    }
  }

  private async safeReleaseAddress(client: EC2Client, allocationId: string) {
    await withAwsRetry('release EC2 Elastic IP', () => client.send(new ReleaseAddressCommand({ AllocationId: allocationId })), [
      'InvalidAllocationID.NotFound',
    ])
  }

  private async authorize(client: EC2Client, direction: 'ingress' | 'egress', groupId: string, perms: any[]) {
    try {
      if (direction === 'ingress') {
        await client.send(new AuthorizeSecurityGroupIngressCommand({ GroupId: groupId, IpPermissions: perms }))
      } else {
        await client.send(new AuthorizeSecurityGroupEgressCommand({ GroupId: groupId, IpPermissions: perms }))
      }
    } catch (error: any) {
      const code = String(error?.name || error?.Code || '')
      if (code.includes('InvalidPermission.Duplicate')) return
      throw error
    }
  }

  private async resolveAmi(client: EC2Client, key: string) {
    if (key.startsWith('ami-')) return key
    const options: Record<string, { owner: string; name: string }> = {
      'ubuntu-24.04': { owner: '099720109477', name: 'ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-*' },
      'ubuntu-22.04': { owner: '099720109477', name: 'ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-*' },
      'debian-12': { owner: '136693071363', name: 'debian-12-*' },
      'amzn-2023': { owner: '137112412989', name: 'al2023-ami-2023.*' },
    }
    const option = options[key]
    if (!option) throw new Error(`Unknown EC2 AMI option: ${key}`)
    const result = await client.send(
      new DescribeImagesCommand({
        Owners: [option.owner],
        Filters: [
          { Name: 'name', Values: [option.name] },
          { Name: 'architecture', Values: ['x86_64'] },
          { Name: 'virtualization-type', Values: ['hvm'] },
          { Name: 'state', Values: ['available'] },
        ],
      }),
    )
    const images = [...(result.Images ?? [])].sort((a, b) => String(b.CreationDate ?? '').localeCompare(String(a.CreationDate ?? '')))
    const ami = String(images[0]?.ImageId ?? '')
    if (!ami) throw new Error(`No EC2 AMI found for: ${key}`)
    return ami
  }

  private async defaultVpcId(client: EC2Client) {
    const result = await client.send(new DescribeVpcsCommand({ Filters: [{ Name: 'is-default', Values: ['true'] }] }))
    const vpcId = String(result.Vpcs?.[0]?.VpcId ?? '')
    if (!vpcId) throw new Error('No default VPC found')
    return vpcId
  }

  private async selectDefaultLaunchSubnet(client: EC2Client) {
    const vpcId = await this.defaultVpcId(client)
    const subnets = await this.subnets(client, vpcId)
    if (!subnets.length) throw new Error('Default VPC has no subnet')
    subnets.sort(this.compareSubnet)
    return String(subnets[0].SubnetId ?? '')
  }

  private async selectIpv6Subnet(client: EC2Client) {
    const vpcId = await this.defaultVpcId(client)
    let subnets = await this.subnets(client, vpcId)
    if (!subnets.length) throw new Error('Default VPC has no subnet')
    const withIpv6 = subnets.filter((s) => this.subnetHasIpv6(s))
    if (withIpv6.length) {
      withIpv6.sort(this.compareSubnet)
      return String(withIpv6[0].SubnetId ?? '')
    }
    // ensure vpc ipv6
    await this.ensureVpcIpv6(client, vpcId)
    subnets = await this.subnets(client, vpcId)
    subnets.sort(this.compareSubnet)
    const target = subnets[0]
    const subnetId = String(target.SubnetId ?? '')
    if (!this.subnetHasIpv6(target)) {
      // try associate a /64 from amazon-provided block if present
      const vpc = await this.vpc(client, vpcId)
      const vpcIpv6 = this.associatedVpcIpv6(vpc)
      if (vpcIpv6) {
        const cidr = this.nextSubnetIpv6Cidr(vpcIpv6, subnets)
        await withAwsRetry('associate EC2 subnet IPv6 CIDR', () =>
          client.send(new AssociateSubnetCidrBlockCommand({ SubnetId: subnetId, Ipv6CidrBlock: cidr })),
        )
      }
    }
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 2000))
      const latest = (await client.send(new DescribeSubnetsCommand({ SubnetIds: [subnetId] }))).Subnets?.[0]
      if (latest && this.subnetHasIpv6(latest)) return subnetId
    }
    // fallback still return subnet; instance create may fail clearly
    return subnetId
  }

  private async ensureVpcIpv6(client: EC2Client, vpcId: string) {
    let vpc = await this.vpc(client, vpcId)
    if (this.associatedVpcIpv6(vpc)) return
    if (!this.hasVpcIpv6Association(vpc)) {
      await withAwsRetry('associate EC2 VPC IPv6 CIDR', () =>
        client.send(new AssociateVpcCidrBlockCommand({ VpcId: vpcId, AmazonProvidedIpv6CidrBlock: true })),
      )
    }
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 2000))
      vpc = await this.vpc(client, vpcId)
      if (this.associatedVpcIpv6(vpc)) return
    }
  }

  private async ensureSubnetIpv6Route(client: EC2Client, subnetId: string) {
    const subnet = (await client.send(new DescribeSubnetsCommand({ SubnetIds: [subnetId] }))).Subnets?.[0]
    const vpcId = String(subnet?.VpcId ?? '')
    const igwResult = await client.send(new DescribeInternetGatewaysCommand({ Filters: [{ Name: 'attachment.vpc-id', Values: [vpcId] }] }))
    const igw = String(igwResult.InternetGateways?.[0]?.InternetGatewayId ?? '')
    if (!igw) return
    let tables = (
      await client.send(new DescribeRouteTablesCommand({ Filters: [{ Name: 'association.subnet-id', Values: [subnetId] }] }))
    ).RouteTables
    if (!tables?.length) {
      tables = (
        await client.send(
          new DescribeRouteTablesCommand({ Filters: [{ Name: 'vpc-id', Values: [vpcId] }, { Name: 'association.main', Values: ['true'] }] }),
        )
      ).RouteTables
    }
    const routeTableId = String(tables?.[0]?.RouteTableId ?? '')
    if (!routeTableId) return
    const exists = (tables?.[0]?.Routes ?? []).some((r) => r.DestinationIpv6CidrBlock === '::/0' && r.GatewayId === igw)
    if (exists) return
    await withAwsRetry(
      'create EC2 IPv6 default route',
      () => client.send(new CreateRouteCommand({ RouteTableId: routeTableId, DestinationIpv6CidrBlock: '::/0', GatewayId: igw })),
      ['RouteAlreadyExists', 'InvalidRoute.Duplicate'],
    )
  }

  private async vpc(client: EC2Client, vpcId: string) {
    return (await client.send(new DescribeVpcsCommand({ VpcIds: [vpcId] }))).Vpcs?.[0] ?? {}
  }
  private async subnets(client: EC2Client, vpcId: string) {
    return (await client.send(new DescribeSubnetsCommand({ Filters: [{ Name: 'vpc-id', Values: [vpcId] }] }))).Subnets ?? []
  }
  private subnetHasIpv6(subnet: any) {
    return (subnet.Ipv6CidrBlockAssociationSet ?? []).some((a: any) => a.Ipv6CidrBlockState?.State === 'associated')
  }
  private associatedVpcIpv6(vpc: any) {
    for (const a of vpc.Ipv6CidrBlockAssociationSet ?? []) {
      if (a.Ipv6CidrBlockState?.State === 'associated') return String(a.Ipv6CidrBlock ?? '')
    }
    return ''
  }
  private hasVpcIpv6Association(vpc: any) {
    return (vpc.Ipv6CidrBlockAssociationSet ?? []).some((a: any) => ['associating', 'associated'].includes(String(a.Ipv6CidrBlockState?.State ?? '')))
  }
  private compareSubnet = (a: any, b: any) => String(a.AvailabilityZone ?? '').localeCompare(String(b.AvailabilityZone ?? '')) || String(a.SubnetId ?? '').localeCompare(String(b.SubnetId ?? ''))

  private nextSubnetIpv6Cidr(vpcIpv6: string, subnets: any[]) {
    // simplified: take first /64 by replacing last 16 bits with 1..n
    const [base, prefix] = vpcIpv6.split('/')
    if (!base || Number(prefix) >= 64) throw new Error('VPC IPv6 CIDR must be shorter than /64')
    const used = new Set<string>()
    for (const subnet of subnets) {
      for (const a of subnet.Ipv6CidrBlockAssociationSet ?? []) {
        if (a.Ipv6CidrBlock) used.add(String(a.Ipv6CidrBlock))
      }
    }
    // produce candidate by appending :0:0:0:1 /64 style from network base
    for (let i = 1; i < 256; i++) {
      // crude but practical for personal use: base hextets + i
      const parts = base.split(':')
      while (parts.length < 8) parts.push('0')
      parts[3] = i.toString(16)
      for (let j = 4; j < 8; j++) parts[j] = '0'
      const candidate = `${parts.slice(0, 4).join(':')}::/64`
      if (!used.has(candidate)) return candidate
    }
    throw new Error('No available IPv6 /64 subnet CIDR')
  }
}
