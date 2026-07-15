import { BUILTIN_APP_CONFIG, type AppConfigData } from '../../config/app-defaults.js'

export type { AppConfigData }

/**
 * Panel catalog config (region labels / blueprints).
 * Source of truth is built-in defaults only — no data/app-config.json.
 */
export class SystemConfigRepository {
  async read(): Promise<AppConfigData> {
    return {
      regions: { ...BUILTIN_APP_CONFIG.regions },
      ec2_regions: { ...BUILTIN_APP_CONFIG.ec2_regions },
      blueprints: { ...BUILTIN_APP_CONFIG.blueprints },
    }
  }
}
