#!/usr/bin/env node
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8')
const exists = (relative: string) => fs.existsSync(path.join(root, relative))

const routeFiles = [
  'src/modules/auth/auth.routes.ts',
  'src/modules/system/system.routes.ts',
  'src/modules/accounts/account.routes.ts',
  'src/workflows/account-management/account-removal.routes.ts',
  'src/modules/lightsail/lightsail.routes.ts',
  'src/modules/ec2/ec2.routes.ts',
  'src/modules/regions/region.routes.ts',
  'src/modules/quota/quota.routes.ts',
  'src/modules/billing/billing.routes.ts',
  'src/modules/newbie/newbie.routes.ts',
]
const routePattern = /\bapp\.(get|post|put|patch|delete)\(\s*['"]([^'"]+)['"]/g
const routes: Array<{ method: string; path: string }> = []
for (const file of routeFiles) {
  const source = read(file)
  for (const match of source.matchAll(routePattern)) routes.push({ method: match[1]!.toUpperCase(), path: match[2]! })
}
routes.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method))
const routeSurface = `${routes.map((route) => `${route.method} ${route.path}`).join('\n')}\n`
assert.equal(routes.length, 32, 'backend API route count changed')
assert.equal(
  crypto.createHash('sha256').update(routeSurface).digest('hex'),
  '8bb1df053005e8f204816a13471ddfa82b2cf05e2bb60351040f0eb0b735ecae',
  'backend API method/path surface changed'
)

const capabilityFiles: Record<string, string[]> = {
  accounts: ['list', 'save', 'remove'],
  auth: ['login', 'logout', 'me'],
  billing: ['yearly'],
  config: ['all'],
  ec2: ['instances', 'sync', 'createOptions', 'create', 'updateRemark', 'action'],
  lightsail: ['instances', 'sync', 'createOptions', 'create', 'updateRemark', 'action'],
  newbie: ['createTask', 'getRecentTask', 'getTask', 'cancelTask', 'streamUrl'],
  quota: ['vcpu'],
  regions: ['list', 'enable'],
}
let apiMethods = 0
for (const [feature, methods] of Object.entries(capabilityFiles)) {
  const candidates = [
    `web/src/features/${feature}/api/${feature.replace(/s$/, '')}-api.ts`,
    `web/src/features/${feature}/api/${feature}.ts`,
    `web/src/features/${feature}/api/auth-api.ts`,
    `web/src/features/${feature}/api/config-api.ts`,
    `web/src/features/${feature}/api/ec2-api.ts`,
  ]
  const file = candidates.find(exists)
  assert.ok(file, `missing API file for ${feature}`)
  const source = read(file!)
  for (const method of methods) {
    assert.match(source, new RegExp(`\\b${method}\\s*(?::|\\()`), `${file} lost ${method}`)
    apiMethods += 1
  }
}
assert.equal(apiMethods, 28, 'frontend API method surface changed')

const pages: Record<string, { markers: string[]; candidates: string[] }> = {
  login: {
    markers: ['登录'],
    candidates: ['web/src/pages/login/LoginPage.vue', 'web/src/features/auth/pages/LoginPage.vue'],
  },
  dashboard: {
    markers: ['控制台'],
    candidates: ['web/src/pages/dashboard/DashboardPage.vue', 'web/src/features/dashboard/pages/DashboardPage.vue'],
  },
  accounts: {
    markers: ['服务商'],
    candidates: ['web/src/pages/accounts/AccountsPage.vue', 'web/src/features/accounts/pages/AccountsPage.vue'],
  },
  lightsail: {
    markers: ['Lightsail'],
    candidates: ['web/src/pages/lightsail/LightsailPage.vue', 'web/src/features/lightsail/pages/LightsailPage.vue'],
  },
  ec2: { markers: ['EC2'], candidates: ['web/src/pages/ec2/Ec2Page.vue', 'web/src/features/ec2/pages/Ec2Page.vue'] },
  newbie: {
    markers: ['新手'],
    candidates: ['web/src/pages/newbie/NewbiePage.vue', 'web/src/features/newbie/pages/NewbiePage.vue'],
  },
  regions: {
    markers: ['区域'],
    candidates: ['web/src/pages/regions/RegionsPage.vue', 'web/src/features/regions/pages/RegionsPage.vue'],
  },
  quota: {
    markers: ['配额'],
    candidates: ['web/src/pages/quota/QuotaPage.vue', 'web/src/features/quota/pages/QuotaPage.vue'],
  },
  billing: {
    markers: ['账单'],
    candidates: ['web/src/pages/billing/BillingPage.vue', 'web/src/features/billing/pages/BillingPage.vue'],
  },
}
for (const [name, page] of Object.entries(pages)) {
  const file = page.candidates.find(exists)
  assert.ok(file, `missing page ${name}`)
  const source = read(file!)
  for (const marker of page.markers) assert.match(source, new RegExp(marker), `${file} lost ${marker}`)
}

const productMarkers: Record<string, string[]> = {
  lightsail: ['allocate_static_ip', 'release_static_ip', 'open_ports', 'reboot', 'delete'],
  ec2: ['allocate_static_ip', 'release_static_ip', 'open_ports', 'reboot', 'terminate'],
  newbie: ['budget', 'ec2', 'lambda', 'rds', 'cancelTask', 'streamUrl'],
}
for (const [feature, markers] of Object.entries(productMarkers)) {
  const dirs = [path.join(root, 'web/src/features', feature), path.join(root, 'web/src/pages', feature)]
  const source = dirs
    .filter((dir) => fs.existsSync(dir))
    .flatMap((dir) =>
      fs
        .readdirSync(dir, { recursive: true })
        .filter((name) => typeof name === 'string' && /\.(?:ts|vue)$/.test(name))
        .map((name) => fs.readFileSync(path.join(dir, name as string), 'utf8'))
    )
    .join('\n')
  for (const marker of markers) {
    assert.match(source.toLowerCase(), new RegExp(marker.toLowerCase()), `${feature} lost ${marker}`)
  }
}

console.log(
  `functional-surface-probe=ok routes=${routes.length} api_methods=${apiMethods} pages=${Object.keys(pages).length}`
)
