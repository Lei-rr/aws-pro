
import {
  AllocateStaticIpCommand,
  AttachStaticIpCommand,
  CreateInstancesCommand,
  DeleteInstanceCommand,
  DetachStaticIpCommand,
  GetInstanceCommand,
  GetInstancesCommand,
  GetRegionsCommand,
  GetStaticIpCommand,
  GetStaticIpsCommand,
  OpenInstancePublicPortsCommand,
  RebootInstanceCommand,
  ReleaseStaticIpCommand,
  StartInstanceCommand,
  StopInstanceCommand,
} from '@aws-sdk/client-lightsail'
import type { AwsAccount, LightsailInstance } from '../../../types/aws.js'
import { ApiError } from '../../http/api-error.js'
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
sed -i 's@^Include[ ]*/etc/ssh/sshd_config.d/\\*.conf@# Include /etc/ssh/sshd_config.d/*.conf@' /etc/ssh/sshd_config
sed -i 's/^#\\?PermitRootLogin.*/PermitRootLogin yes/g' /etc/ssh/sshd_config
sed -i 's/^#\\?PasswordAuthentication.*/PasswordAuthentication yes/g' /etc/ssh/sshd_config
sed -i 's/^#\\?PubkeyAuthentication.*/PubkeyAuthentication no/g' /etc/ssh/sshd_config
sed -i '/^AuthorizedKeysFile/s/^/#/' /etc/ssh/sshd_config
sed -i 's/^#\\?KbdInteractiveAuthentication.*/KbdInteractiveAuthentication yes/g' /etc/ssh/sshd_config
sed -i 's/^#\\?ChallengeResponseAuthentication.*/ChallengeResponseAuthentication yes/g' /etc/ssh/sshd_config
if grep -qi alpine /etc/os-release 2>/dev/null; then service sshd restart || true; else systemctl restart ssh || systemctl restart sshd || service ssh restart || service sshd restart || true; fi
`
}

export class LightsailProvider {
  constructor(private readonly clients: AwsClientFactory) {}

  async availabilityZones(account: AwsAccount, region: string): Promise<string[]> {
    return awsCall('lightsail.availability_zones', async () => {
      const result = await this.clients.lightsail(account, region).send(new GetRegionsCommand({ includeAvailabilityZones: true }))
      const items: string[] = []
      for (const item of result.regions ?? []) {
        if (item.name !== region) continue
        for (const zone of item.availabilityZones ?? []) {
          if (zone.state === 'available' && zone.zoneName) items.push(zone.zoneName)
        }
      }
      return items
    })
  }

  async createInstance(account: AwsAccount, region: string, data: Record<string, any>) {
    return awsCall('lightsail.create_instance', async () => {
      const input: any = {
        instanceNames: [data.name],
        availabilityZone: data.zone,
        blueprintId: data.blueprint,
        bundleId: data.bundle,
        ipAddressType: data.ip_address_type ?? 'dualstack',
      }
      if (data.root_password) input.userData = rootPasswordUserData(String(data.root_password))
      await withAwsRetry('create Lightsail instance', () =>
        this.clients.lightsail(account, region).send(new CreateInstancesCommand(input)),
      )
    })
  }

  async instances(account: AwsAccount, region: string): Promise<LightsailInstance[]> {
    return awsCall('lightsail.instances', async () => {
      const client = this.clients.lightsail(account, region)
      const staticIps: Record<string, string> = {}
      try {
        const sip = await client.send(new GetStaticIpsCommand({}))
        for (const ip of sip.staticIps ?? []) {
          if (ip.attachedTo && ip.ipAddress && ip.isAttached !== false) staticIps[ip.attachedTo] = ip.ipAddress
        }
      } catch {
        // ignore
      }
      const result = await client.send(new GetInstancesCommand({}))
      return (result.instances ?? []).map((item) => {
        const name = String(item.name ?? '')
        return {
          account_id: account.id,
          region,
          name,
          state: String(item.state?.name ?? ''),
          public_ip: item.publicIpAddress ?? '',
          static_ip: staticIps[name] ?? '',
          ipv6: item.ipv6Addresses?.[0] ?? '',
          zone: item.location?.availabilityZone ?? '',
          bundle_id: String(item.bundleId ?? ''),
        }
      })
    })
  }

  async allocateStaticIp(account: AwsAccount, region: string, instanceName: string) {
    return awsCall('lightsail.allocate_static_ip', async () => {
      const client = this.clients.lightsail(account, region)
      await this.ensurePublicIpv4(client, instanceName)
      const staticIpName = `sip-${instanceName.replace(/[^A-Za-z0-9-]/g, '-')}-${Date.now()}`
      await withAwsRetry('allocate Lightsail static IP', () => client.send(new AllocateStaticIpCommand({ staticIpName })))
      try {
        await withAwsRetry('attach Lightsail static IP', () =>
          client.send(new AttachStaticIpCommand({ staticIpName, instanceName })),
        )
      } catch (error) {
        await this.safeRelease(client, staticIpName)
        throw error
      }
    })
  }

  async releaseStaticIp(account: AwsAccount, region: string, instanceName: string) {
    return awsCall('lightsail.release_static_ip', async () => {
      const client = this.clients.lightsail(account, region)
      const staticIpName = await this.attachedStaticIpName(client, instanceName)
      if (!staticIpName) return
      await withAwsRetry('detach Lightsail static IP', () => client.send(new DetachStaticIpCommand({ staticIpName })))
      await this.waitDetached(client, staticIpName)
      await this.safeRelease(client, staticIpName)
    })
  }

  async startInstance(account: AwsAccount, region: string, instanceName: string) {
    return awsCall('lightsail.start_instance', async () => {
      await withAwsRetry('start Lightsail instance', () =>
        this.clients.lightsail(account, region).send(new StartInstanceCommand({ instanceName })),
      )
    })
  }

  async stopInstance(account: AwsAccount, region: string, instanceName: string) {
    return awsCall('lightsail.stop_instance', async () => {
      await withAwsRetry('stop Lightsail instance', () =>
        this.clients.lightsail(account, region).send(new StopInstanceCommand({ instanceName })),
      )
    })
  }

  async rebootInstance(account: AwsAccount, region: string, instanceName: string) {
    return awsCall('lightsail.reboot_instance', async () => {
      await withAwsRetry('reboot Lightsail instance', () =>
        this.clients.lightsail(account, region).send(new RebootInstanceCommand({ instanceName })),
      )
    })
  }

  async deleteInstance(account: AwsAccount, region: string, instanceName: string) {
    return awsCall('lightsail.delete_instance', async () => {
      try {
        await this.releaseStaticIp(account, region, instanceName)
      } catch (error) {
        throw new Error(`Static IP cleanup failed; instance was not deleted: ${error instanceof Error ? error.message : String(error)}`)
      }
      await withAwsRetry('delete Lightsail instance', () =>
        this.clients.lightsail(account, region).send(new DeleteInstanceCommand({ instanceName })),
      )
    })
  }

  async openAllPorts(account: AwsAccount, region: string, instanceName: string) {
    return awsCall('lightsail.open_all_ports', async () => {
      await withAwsRetry('open Lightsail ports', () =>
        this.clients.lightsail(account, region).send(
          new OpenInstancePublicPortsCommand({
            instanceName,
            portInfo: { fromPort: 0, toPort: 65535, protocol: 'all' },
          }),
        ),
      )
    })
  }

  private async ensurePublicIpv4(client: any, instanceName: string) {
    const result = await withAwsRetry('get Lightsail instance before static IP allocation', () =>
      client.send(new GetInstanceCommand({ instanceName })),
    )
    const publicIp = String((result as any)?.instance?.publicIpAddress ?? '')
    if (!publicIp) {
      throw new ApiError('lightsail_static_ip_unavailable', 'IPv6-only Lightsail instances cannot bind a static IPv4 address', 422, {
        instance: instanceName,
      })
    }
  }

  private async attachedStaticIpName(client: any, instanceName: string) {
    const result = await client.send(new GetStaticIpsCommand({}))
    for (const ip of result.staticIps ?? []) {
      if (ip.attachedTo === instanceName && ip.isAttached !== false) return String(ip.name ?? '')
    }
    return ''
  }

  private async waitDetached(client: any, staticIpName: string) {
    for (let i = 0; i < 20; i++) {
      try {
        const result = await client.send(new GetStaticIpCommand({ staticIpName }))
        const ip = result.staticIp ?? {}
        if (!ip.isAttached || !ip.attachedTo) return
      } catch {
        return
      }
      await new Promise((r) => setTimeout(r, 2000))
    }
    throw new Error(`Lightsail static IP did not detach: ${staticIpName}`)
  }

  private async safeRelease(client: any, staticIpName: string) {
    if (!staticIpName) return
    await withAwsRetry(
      'release Lightsail static IP',
      () => client.send(new ReleaseStaticIpCommand({ staticIpName })),
      ['NotFoundException'],
    )
  }
}
