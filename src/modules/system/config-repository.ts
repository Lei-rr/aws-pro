import { JsonStore } from '../../lib/storage/json-store.js'

export type AppConfigData = {
  regions: Record<string, string>
  ec2_regions: Record<string, string>
  blueprints: Record<string, string>
}

const DEFAULT: AppConfigData = {
  regions: {},
  ec2_regions: {},
  blueprints: {},
}

export class SystemConfigRepository {
  constructor(private readonly store = new JsonStore<AppConfigData>('app-config.json', DEFAULT)) {}

  async read(): Promise<AppConfigData> {
    const data = await this.store.read()
    return {
      regions: data.regions ?? {},
      ec2_regions: data.ec2_regions ?? {},
      blueprints: data.blueprints ?? {},
    }
  }
}
